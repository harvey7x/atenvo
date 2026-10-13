/* Lição 5 — Os dois canais e o robô. De onde vem o cliente (anúncio no
   Facebook → WhatsApp), a diferença entre o canal de juros abusivos e o de
   empréstimo, o que o robô e a IA já conversaram (copy LITERAL do processo
   oficial de 18/09), o que chega na mão do atendente, o cuidado com a
   "pré-aprovada" e o que fazer quando o cliente responde NÃO.
   Correção do dono (13/10): a revisão é dos juros do EMPRÉSTIMO PESSOAL; o
   consignado é o assunto dos ganchos do canal de empréstimo. */
import type { Licao } from '../tipos';
import {
  Aviso, BomRuim, Celular, Conversa, Fatos, Figura, Frase, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
  type Bolha,
} from '../pecas';
import {
  Anotacoes, AnunciosIlustrados, ArvoreNao, CaminhoDoLead, DoisEmprestimos, FichasNaMao, FluxoPorCanal, PontoDePartida,
  PreAprovadaEeNao, QualCanal, ReguaPreAprovada, SimuladorPortas,
} from './05-canais-figuras';
import './05-canais.css';

/* ------------------------------------------------------------ conversas do robô (texto literal) */
const CEL_JUROS: Bolha[] = [
  { de: 'robo', texto: 'Olá! Seja bem-vindo(a) à CAF! 👋', hora: '09:41' },
  { de: 'robo', tipo: 'video', legenda: 'Assista esse video, leva apenas 30 segundos.', hora: '09:41' },
  { de: 'robo', texto: 'Gostaria de fazer *análise gratuita* pra descobrir se você paga juros abusivos e recuperar valores?', hora: '09:41' },
  { de: 'robo', texto: 'Responda *SIM* ou *NÃO* 😊', hora: '09:41' },
  { de: 'cliente', texto: 'SIM', hora: '09:43' },
  { de: 'robo', texto: 'Ótima decisão! 👏', hora: '09:43' },
  { de: 'robo', texto: 'Para iniciarmos sua análise, me informe seu nome completo:', hora: '09:43' },
  { de: 'cliente', texto: 'Maria Aparecida Souza', hora: '09:44' },
  { de: 'robo', texto: 'Poderia me informar seu *CPF*?', hora: '09:44' },
  { de: 'robo', texto: '🔒 Seus dados são usados somente para a consulta. *Nunca pedimos senhas, códigos ou qualquer pagamento.*', hora: '09:44' },
  { de: 'cliente', texto: '123.456.789-00', hora: '09:45' },
  { de: 'robo', texto: '✅ Recebido, Maria!', hora: '09:45' },
  { de: 'robo', texto: 'Sua análise foi iniciada. Em alguns minutos retorno aqui com uma atualização.', hora: '09:45' },
];

const CEL_EMP_ROBO: Bolha[] = [
  { de: 'robo', tipo: 'imagem', legenda: 'Olá! Seja bem-vindo(a) à CAF!', hora: '14:02' },
  { de: 'robo', texto: 'Gostaria de fazer uma análise pra ver se é liberado algum valor', hora: '14:02' },
  { de: 'robo', texto: 'Responda *SIM* ou *NÃO* 😊', hora: '14:02' },
  { de: 'cliente', texto: 'SIM', hora: '14:03' },
  { de: 'robo', texto: 'Ótima decisão! 👏', hora: '14:03' },
  { de: 'robo', texto: 'Para iniciarmos sua análise, me informe seu nome completo:', hora: '14:03' },
  { de: 'cliente', texto: 'José Carlos Pereira', hora: '14:04' },
  { de: 'robo', texto: 'Poderia me informar seu *CPF*?', hora: '14:04' },
  { de: 'robo', texto: '🔒 Seus dados são usados somente para a consulta.', hora: '14:04' },
  { de: 'cliente', texto: '987.654.321-00', hora: '14:05' },
  { de: 'robo', texto: '✅ Recebido, José!', hora: '14:05' },
  { de: 'robo', texto: 'Em instantes um analista vai falar com você aqui mesmo.', hora: '14:05' },
];

/* lista fixa de documentos da IA; "[…]" = trecho do aviso sobre o comprovante, omitido aqui */
const LISTA_DOCS = [
  '*📁 | DOCUMENTAÇÃO NECESSÁRIA:*',
  '- RG OU CNH *(FRENTE/VERSO)*',
  '- COMPROVANTE DE RESIDÊNCIA',
  '- FOTO DO ROSTO',
  '- E-MAIL (DO SEU USO)',
  '*⚠️ | IMPORTANTE:*',
  '[…]',
  '- CONTA DE ÁGUA/LUZ',
  '- CONTA DE INTERNET/TELEFONE',
  '- CONTA DE TV *(TIM/CLARO/SKY)*',
].join('\n');

const CEL_EMP_IA: Bolha[] = [
  { de: 'robo', texto: '[a IA pergunta se ele recebe algum benefício do INSS]', hora: '14:05' },
  { de: 'cliente', texto: 'Sou aposentado.', hora: '14:06' },
  { de: 'robo', texto: '[pergunta se ele tem empréstimo pessoal no Agibank, BMG, Facta, Mercantil ou Crefisa]', hora: '14:06' },
  { de: 'cliente', texto: 'Tenho no Mercantil e no BMG.', hora: '14:07' },
  { de: 'robo', texto: '[avisa que vai fazer a análise e espera uns 5 minutos]', hora: '14:07' },
  { de: 'robo', texto: 'Boa notícia, José! Sua análise foi *pré-aprovada*.', hora: '14:12' },
  { de: 'robo', texto: LISTA_DOCS, hora: '14:12' },
  { de: 'robo', texto: '[pergunta se ele tem a senha do gov.br ou se usa o Meu INSS]', hora: '14:12' },
  { de: 'cliente', texto: 'Tenho a senha, mas não sei mexer.', hora: '14:13' },
  { de: 'robo', texto: '[passa a conversa para um analista humano: você]', hora: '14:13' },
];

const CEL_NAO: Bolha[] = [
  { de: 'robo', texto: 'Gostaria de fazer *análise gratuita* pra descobrir se você paga juros abusivos e recuperar valores?', hora: '16:20' },
  { de: 'robo', texto: 'Responda *SIM* ou *NÃO* 😊', hora: '16:20' },
  { de: 'cliente', texto: 'NÃO', hora: '16:22' },
  { de: 'robo', texto: 'Sem problema! 😊 Se mudar de ideia, é só mandar um *SIM* aqui a qualquer momento. A análise é gratuita e fica à sua disposição.', hora: '16:22' },
];

/* ------------------------------------------------------------ corpo da lição */
const corpo = (
  <>
    <p className="mv-lead">
      Todo cliente que aparece para você chegou por uma de duas portas: o anúncio de <b>juros abusivos</b> ou o anúncio
      de <b>empréstimo</b>. E antes do seu primeiro “olá”, um <b>robô</b> já conversou com ele: deu boas-vindas, perguntou se
      ele queria a análise, pegou o nome e o CPF. No canal de empréstimo, uma <b>IA</b> ainda fez mais perguntas e, para quem passou
      nelas, mandou uma mensagem dizendo que a análise foi <b>pré-aprovada</b>. Nesta lição você vai ver exatamente o que o cliente leu antes de
      chegar até você, o que ele espera ouvir e como continuar a conversa do ponto certo, sem repetir pergunta e sem criar
      expectativa falsa.
    </p>

    <Fatos itens={[
      { grande: '2 canais', texto: 'Dois tráfegos pagos no Facebook: o de juros abusivos (do Andrius) e o de empréstimo.' },
      { grande: 'Nome + CPF', texto: 'É o que todo cliente já informou ao robô quando a conversa chega até você.' },
      { grande: '3 portas', texto: 'No canal de empréstimo, a IA ainda confere se a pessoa é elegível antes de passar a conversa.' },
      { grande: 'Sem valores', texto: 'A IA nunca cita valores, taxas ou juros. Você também não promete valor nenhum.' },
    ]} />

    <Secao titulo="De onde vem o cliente">
      <p>
        A CAF anuncia no <b>Facebook</b> para <b>aposentados e pensionistas do INSS</b>. É o que se chama de <b>tráfego
        pago</b>: a empresa paga para que o anúncio apareça para esse público enquanto a pessoa rola a tela do celular. Quando
        ela se interessa, toca no botão do anúncio e o <b>WhatsApp abre direto numa conversa com a gente</b>. A partir desse
        toque, ela vira um <b>lead</b>: um possível cliente, que mostrou interesse mas ainda não fechou nada.
      </p>
      <p>
        O anúncio fala com aposentado e pensionista porque esse é o público principal. Mas guarde a regra oficial: <b>qualquer
        benefício do INSS serve</b> (aposentadoria, pensão, auxílio, BPC/LOAS). Quem trabalha de carteira assinada ou é servidor e
        não recebe nada do INSS não serve, a não ser que um familiar próximo receba. Você vai ver essa lógica nas 3 portas, mais
        abaixo.
      </p>
      <Figura tag="Diagrama" legenda="O caminho do lead, do anúncio até você. A etapa da IA (tracejada) só existe no canal de empréstimo.">
        <CaminhoDoLead />
      </Figura>
      <p>
        Repare quanta coisa acontece antes de você entrar. Por isso, a primeira regra desta lição é: <b>leia o histórico da
        conversa antes de escrever</b>. Ali está de qual canal o cliente veio, o que o robô prometeu e o que o cliente já
        respondeu.
      </p>
      <Figura legenda="Anúncios ilustrativos, criados para este manual. Não são os anúncios reais: o que importa aqui é o formato.">
        <AnunciosIlustrados />
      </Figura>
      <p>
        O texto de cada anúncio já separa os dois públicos. Um fala de <b>juros abusivos</b>; o outro fala em <b>ver se é
        liberado algum valor</b>. Cada um atrai uma pessoa com uma vontade diferente, e é essa vontade que muda a sua conversa.
      </p>
    </Secao>

    <Secao titulo="Dois canais, dois clientes diferentes">
      <p>
        Hoje a CAF tem dois tráfegos pagos. Os dois trazem o mesmo tipo de pessoa (quem recebe do INSS), mas com cabeças bem
        diferentes na hora em que chegam.
      </p>
      <div className="mv-duas">
        <div className="vidro mv-cartao mv-canal mv-cn-canal" data-tom="azul">
          <small>Canal 1 · tráfego do Andrius</small>
          <h4>Juros abusivos</h4>
          <p>
            O nome do canal é <b>JUROS ABUSIVO (ANDRIUS)</b>. O cliente viu um anúncio sobre <b>juros abusivos</b> e
            veio por isso: <b>ele já quer a revisão</b>. É um público mais nichado, que chega sabendo o assunto.
          </p>
          <div className="mv-canal-pe"><span>Venda</span><b>Mais direta</b></div>
          <Lista itens={['Dar a atualização que o robô prometeu', 'Confirmar o perfil (as 3 portas)', 'Explicar o processo e partir para os documentos']} />
        </div>
        <div className="vidro mv-cartao mv-canal mv-cn-canal" data-tom="ambar">
          <small>Canal 2 · tráfego de empréstimo</small>
          <h4>Empréstimo</h4>
          <p>
            O cliente <b>quer dinheiro rápido</b>, em geral um <b>consignado novo</b>, e chega com a palavra “pré-aprovada” na
            cabeça. Só que a maioria <b>não tem margem disponível</b> para isso.
          </p>
          <div className="mv-canal-pe"><span>Venda</span><b>Convencer</b></div>
          <Lista itens={['Apresentar-se e explicar a pré-aprovada', 'Entender o que ele precisa e pedir os extratos', 'Explicar a margem e mostrar os caminhos']} />
        </div>
      </div>
      <Figura tag="Diagrama" legenda="O ponto de partida de cada cliente. Quanto mais longe do SIM ele começa, mais você precisa explicar.">
        <PontoDePartida />
      </Figura>
      <p>
        Pense na conversa como um caminho até o <b>SIM ao processo</b>. O cliente de juros já começa perto: foi ele que procurou a
        revisão. O de empréstimo começa longe: ele queria outra coisa, e você vai precisar entender o que ele busca, verificar a
        situação dele e mostrar por que os caminhos que a CAF oferece fazem sentido. Nenhum dos dois é cliente “pior”. São
        conversas diferentes, e cada uma pede uma postura.
      </p>
      <Tabela
        colunas={['Comparando', 'Juros abusivos (Andrius)', 'Empréstimo']}
        destaque={0}
        linhas={[
          ['O que o cliente quer', 'Revisar os juros do empréstimo pessoal que tem com a financeira.', 'Dinheiro rápido: um consignado novo. A maioria não tem margem para isso.'],
          ['O que você oferece', 'O processo de revisão dos juros do empréstimo pessoal.', 'Os caminhos do consignado (aumento de margem, portabilidade) e a revisão dos juros do empréstimo pessoal que ele já tem.'],
          ['Tipo de venda', 'Mais direta: confirmar, explicar, pedir os documentos.', 'Consultiva: entender, verificar, convencer.'],
          ['O que ele espera ouvir', 'Como funciona, se ele tem direito e quanto custa.', 'Quanto vai ser liberado e quando o dinheiro cai.'],
          ['O que o robô mandou', 'Vídeo de 30 segundos e convite para a análise gratuita.', 'Imagem de boas-vindas e convite para ver se é liberado algum valor.'],
          ['Quem confere as 3 portas', 'Você, na conversa.', 'A IA, antes de passar a conversa.'],
          ['Onde a conversa parou', 'Na promessa de uma atualização “em alguns minutos”.', 'Na pergunta sobre o gov.br, depois da pré-aprovada e da lista de documentos.'],
          ['Seu primeiro passo', 'Dar a atualização prometida e confirmar o perfil.', 'Assumir, alinhar a expectativa, entender o que ele precisa e conferir os extratos.'],
          ['O maior cuidado', 'Não deixar esfriar: ele está esperando o retorno.', 'Não confirmar dinheiro que ainda não foi verificado.'],
        ]}
      />
      <TesteRapido
        pergunta="Chegou uma conversa do canal JUROS ABUSIVO (ANDRIUS). O que você espera desse cliente?"
        opcoes={[
          'Que ele queira um empréstimo novo e precise ser convencido do zero',
          'Que ele já queira a revisão dos juros: a venda tende a ser mais direta',
          'Que ele só queira tirar uma dúvida, sem intenção de seguir adiante',
        ]}
        certa={1}
        explica="Quem vem pelo tráfego do Andrius viu um anúncio sobre juros abusivos e veio por isso. Confirme o perfil, explique o processo e siga para os documentos."
      />
    </Secao>

    <Secao titulo="Consignado ou empréstimo pessoal: não confunda">
      <p>
        Repare que os dois canais falam de <b>empréstimos diferentes</b>. O cliente do canal de empréstimo quer um
        <b> consignado</b> novo. Já o processo da CAF, nos dois canais, revisa os juros do <b>empréstimo pessoal</b> que o
        cliente fez com as financeiras (Agibank, BMG, Facta, Mercantil ou Crefisa). Em uma frase: <b>o consignado é descontado
        pelo INSS; o empréstimo pessoal é cobrado pela financeira, fora do INSS.</b>
      </p>
      <Figura tag="Comparativo" legenda="Os dois empréstimos lado a lado. O destaque na trilha mostra em que ponto a parcela é paga. A explicação completa de consignado e margem está na lição 3.">
        <DoisEmprestimos />
      </Figura>
      <p>
        É por isso que o canal de empréstimo tem duas conversas numa só. Uma é sobre os <b>consignados</b>: sem margem, não sai
        um novo, e os caminhos são o aumento de margem e a portabilidade dos consignados. A outra é sobre o <b>empréstimo
        pessoal</b> que ele já tem: a revisão dos juros. Misturar as duas confunde o cliente e passa uma informação errada.
      </p>
      <Aviso titulo="Como perguntar sem complicar">
        Muita gente não sabe o nome do empréstimo que tem. Em vez de perguntar só “o senhor tem empréstimo pessoal?”, explique:
        “é aquele empréstimo que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício”. O cliente
        costuma lembrar pelo nome do banco e pelo débito na conta.
      </Aviso>
      <TesteRapido
        pergunta="No canal de juros, a cliente pergunta: “É sobre aquele empréstimo que o INSS desconta direto do meu benefício?” O que você responde?"
        opcoes={[
          '“É esse mesmo: os juros abusivos ficam no consignado que o INSS desconta.”',
          '“Não, é outro: o empréstimo pessoal, que a financeira cobra fora do INSS.”',
          '“Tanto faz: a revisão vale para qualquer empréstimo que a senhora tiver.”',
        ]}
        certa={1}
        explica="O que o INSS desconta direto do benefício é o consignado. O processo da CAF revisa os juros do empréstimo pessoal: o contrato direto com a financeira, cobrado fora do INSS."
      />
    </Secao>

    <Secao titulo="O robô e a IA: quem trabalha antes de você">
      <p>No atendimento, duas coisas automáticas conversam com o cliente antes de você. Saber a diferença ajuda a entender o histórico.</p>
      <div className="mv-duas">
        <div className="vidro mv-cartao" data-tom="verde">
          <h4>O robô (nos dois canais)</h4>
          <p>
            É um fluxo de <b>mensagens fixas</b>, sempre iguais e sempre na mesma ordem: boas-vindas, vídeo ou imagem, o convite,
            o SIM ou NÃO, o pedido de nome e de CPF. Ele não improvisa: segue sempre o mesmo roteiro.
          </p>
        </div>
        <div className="vidro mv-cartao" data-tom="ambar">
          <h4>A IA (só no canal de empréstimo)</h4>
          <p>
            Conversa de um jeito mais livre: faz as perguntas das <b>3 portas</b>, avisa que vai analisar e, uns 5 minutos depois,
            manda a pré-aprovação e a lista de documentos. <b>Nunca cita valores, taxas ou juros.</b> No fim, passa a conversa
            para um analista humano: você.
          </p>
        </div>
      </div>
      <p>
        Por que isso existe? Porque o cliente recebe resposta <b>na hora</b> em que toca no anúncio, que é quando o interesse está
        mais quente. E porque, quando a conversa chega até você, o básico já está feito. O seu tempo vai para o que só uma pessoa
        faz bem: explicar, tirar dúvidas, ter paciência e conquistar a confiança.
      </p>
      <Aviso titulo="Asteriscos viram negrito">
        Nas mensagens do robô você vai ver palavras entre asteriscos, como *SIM*. No WhatsApp, o texto entre asteriscos aparece em
        <b> negrito</b> para o cliente. Neste manual as mensagens estão escritas exatamente como foram cadastradas, com os asteriscos.
      </Aviso>
    </Secao>

    <Secao titulo="Canal de juros abusivos: o que o robô já conversou">
      <p>
        Esta é a conversa completa do robô no canal de juros, com as mensagens exatas. À direita, o que cada parte faz. O cliente
        do exemplo, com nome e CPF, é fictício.
      </p>
      <div className="mv-cn-cel-grade">
        <Celular contato="CAF" bolhas={CEL_JUROS}
          legenda="Canal de juros: as mensagens do robô, com o texto exato. Nome e CPF são fictícios." />
        <Anotacoes itens={[
          { t: 'Boas-vindas', d: 'Cumprimenta e apresenta a CAF. O cliente já sabe com quem está falando.' },
          { t: 'Vídeo de 30 segundos', d: 'Um vídeo curto vem antes da pergunta. Se o cliente comentar algo “do vídeo”, você sabe de onde veio.' },
          { t: 'O convite', d: <>Oferece a <b>análise gratuita</b> para descobrir se ele paga juros abusivos. Repare: a palavra é análise. Ninguém prometeu valor.</> },
          { t: 'SIM ou NÃO', d: 'Uma escolha simples. Só segue quem responde SIM.' },
          { t: 'Nome completo', d: 'Depois do SIM, o robô elogia a decisão e pede o nome.' },
          { t: 'CPF e segurança', d: 'Pede o CPF e tranquiliza: os dados são só para a consulta, e a CAF nunca pede senhas, códigos ou pagamento.' },
          { t: 'Recebido', d: <>Confirma com o primeiro nome e promete: “Em alguns minutos retorno aqui com uma atualização.” <b>Quem dá essa atualização é você.</b></> },
        ]} />
      </div>
      <Aviso tom="ambar" titulo="Repare no que o robô NÃO perguntou">
        No canal de juros, o robô não pergunta se a pessoa recebe do INSS nem se ela tem empréstimo pessoal numa das 5
        financeiras. Ou seja: as <b>3 portas ficam com você</b>. Antes de explicar o processo, confirme o benefício do INSS e o
        <b> empréstimo pessoal</b> com Agibank, BMG, Facta, Mercantil ou Crefisa.
      </Aviso>
      <p>
        Na prática, você entra na conversa logo depois da mensagem de “Recebido”. O cliente está esperando a atualização
        prometida, então comece justamente por ela e emende a confirmação do perfil. Como se apresentar e o roteiro das
        perguntas estão na lição 6.
      </p>
      <TesteRapido
        pergunta="No canal de juros, o que o robô já pegou do cliente quando a conversa chega até você?"
        opcoes={['Benefício do INSS e a financeira', 'Senha do gov.br e comprovante', 'Nome completo e CPF']}
        certa={2}
        explica="O robô do canal de juros pega só o nome completo e o CPF. Confirmar o benefício do INSS e o empréstimo pessoal numa das 5 financeiras (as 3 portas) é com você."
      />
    </Secao>

    <Secao titulo="Canal de empréstimo: o robô e depois a IA">
      <p>
        No canal de empréstimo a conversa automática tem duas partes. Primeiro o <b>robô</b> faz a recepção, com mensagens fixas
        parecidas com as do outro canal, mas com uma imagem no lugar do vídeo e um convite diferente. Depois a <b>IA</b> assume,
        confere se a pessoa é elegível e só então passa a conversa para você.
      </p>
      <h4 className="mv-cn-sub">Parte 1: a recepção do robô <span>mensagens fixas</span></h4>
      <div className="mv-cn-cel-grade">
        <Celular contato="CAF" bolhas={CEL_EMP_ROBO}
          legenda="Canal de empréstimo: a recepção. Entre colchetes, um resumo (não é o texto exato)." />
        <Anotacoes itens={[
          { t: 'Imagem de boas-vindas', d: 'A primeira mensagem é uma imagem, com a legenda de boas-vindas à CAF.' },
          { t: 'O convite', d: <>“Gostaria de fazer uma análise pra ver se é liberado algum valor”. O cliente entende que <b>pode sair dinheiro</b>. É daqui que nasce a expectativa.</> },
          { t: 'SIM ou NÃO', d: 'A mesma escolha simples do outro canal.' },
          { t: 'Nome', d: 'Depois do SIM, o robô pede o nome completo.' },
          { t: 'CPF', d: 'Pede o CPF e explica que os dados são usados somente para a consulta.' },
          { t: 'Recebido', d: <>“Em instantes um analista vai falar com você aqui mesmo.” O cliente fica esperando <b>uma pessoa</b>.</> },
        ]} />
      </div>

      <h4 className="mv-cn-sub">Parte 2: a IA confere as 3 portas <span>elegibilidade</span></h4>
      <p>
        Logo em seguida a IA faz as perguntas que decidem se a pessoa pode seguir. São as <b>3 portas</b>: (1) recebe algum
        benefício do INSS? (2) se não recebe, algum familiar recebe? (3) tem empréstimo pessoal em alguma das 5 financeiras? Experimente o
        simulador: responda como se fosse o cliente e veja o que a IA faz em cada caso.
      </p>
      <SimuladorPortas />
      <p>
        Duas coisas importantes. Primeiro: quando a análise segue <b>pelo familiar</b>, os documentos (Meu INSS, imposto de
        renda, CPF, identidade, foto do rosto, comprovante e e-mail) passam a ser <b>do familiar que recebe</b>; na dúvida,
        pergunte ao gestor. Segundo: no canal de juros essas mesmas portas são conferidas <b>por você</b>, na conversa. A regra
        completa das portas, caso a caso, está na lição 4.
      </p>
      <Aviso tom="ambar" titulo="Não elegível: com carinho, sem insistir">
        Quando ninguém da família recebe do INSS, ou quando a pessoa não tem empréstimo pessoal em nenhuma das 5 financeiras, a IA
        agradece e encerra a conversa sem insistir. Se isso acontecer numa conversa sua, faça igual.
      </Aviso>

      <h4 className="mv-cn-sub">Parte 3: pré-aprovada e documentos <span>IA</span></h4>
      <div className="mv-cn-cel-grade">
        <Celular contato="CAF" bolhas={CEL_EMP_IA}
          legenda="Canal de empréstimo: a parte da IA. Entre colchetes, resumo do que acontece; “[…]” marca um trecho omitido aqui. O resto é o texto exato." />
        <Anotacoes itens={[
          { t: 'As perguntas das portas', d: 'A IA confere o benefício do INSS e se há empréstimo pessoal numa das 5 financeiras. O texto dela varia, por isso aparece resumido.' },
          { t: 'Uns 5 minutos de espera', d: 'A IA avisa que vai fazer a análise e espera um pouco antes de responder.' },
          { t: 'Pré-aprovada', d: <>“Boa notícia, José! Sua análise foi <b>pré-aprovada</b>.” Para o cliente, isso soa como dinheiro garantido. <b>Não é.</b> Veja a seção sobre isso logo abaixo.</> },
          { t: 'Lista de documentos', d: 'Uma lista fixa: RG ou CNH (frente e verso), comprovante de residência, foto do rosto e e-mail, com exemplos de conta que servem como comprovante (água ou luz, internet ou telefone, TV).' },
          { t: 'gov.br e Meu INSS', d: 'A IA pergunta se a pessoa tem a senha do gov.br ou se usa o Meu INSS.' },
          { t: 'Passa para você', d: 'A conversa vai para um analista humano, que vai pegar os extratos do INSS. Esse analista é você.' },
        ]} />
      </div>
    </Secao>

    <Secao titulo="Treino: de qual canal é esta mensagem?">
      <p>
        Um jeito rápido de saber de onde o cliente veio é olhar as primeiras mensagens automáticas no histórico. Cada canal tem as
        suas. Classifique as mensagens abaixo (todas são texto real do robô ou da IA):
      </p>
      <QualCanal />
    </Secao>

    <Secao titulo="O que chega na sua mão">
      <p>
        Resumindo tudo o que você viu: quando a conversa chega até você, uma parte do trabalho já está pronta e outra parte é sua.
        Compare os dois canais:
      </p>
      <FichasNaMao />
      <p>
        Use o que já está pronto. <b>Não peça de novo o nome ou o CPF</b> como se a conversa estivesse começando: o cliente já
        respondeu e vai achar que ninguém leu. O passo a passo de como ler o histórico e se apresentar está na lição 6.
      </p>
      <p>
        E tem mais uma coisa que chega na sua mão, e que pouca gente percebe: <b>as promessas</b>. Tudo o que o robô e a IA
        disseram ao cliente, a CAF disse. Quem cumpre, daqui para a frente, é você.
      </p>
      <Tabela
        colunas={['O que o cliente leu', 'Canal', 'O que isso exige de você']}
        linhas={[
          ['“Em alguns minutos retorno aqui com uma atualização.”', 'Juros', 'Assumir logo e começar justamente pela atualização.'],
          ['“Em instantes um analista vai falar com você aqui mesmo.”', 'Empréstimo', 'Assumir logo e se apresentar como a pessoa que vai cuidar do caso.'],
          [<>“<b>análise gratuita</b>”</>, 'Juros', 'Nunca cobrar nada para começar. Os 30% de honorários só saem no final, do que o cliente receber (lição 2).'],
          ['“Seus dados são usados somente para a consulta.”', 'Os dois', 'Usar os dados do cliente só para o atendimento dele. Nada de repassar ou comentar fora.'],
          [<>“<b>Nunca pedimos senhas, códigos ou qualquer pagamento.</b>”</>, 'Juros', 'Nunca pedir pagamento e nunca pressionar ninguém a passar senha. Se o próprio cliente preferir passar a senha do gov.br, siga a lição 10.'],
          [<>“Sua análise foi <b>pré-aprovada</b>.”</>, 'Empréstimo', 'Conduzir com honestidade: conferir os extratos antes de falar em valor.'],
        ]}
      />
      <p>
        No canal de empréstimo, o cliente também já recebeu a lista de documentos, então é comum ele chegar com perguntas sobre ela.
        Estas são as respostas oficiais, as mesmas que a IA usa:
      </p>
      <Sanfona itens={[
        { titulo: '“Não tenho e-mail.”', corpo: <p>Sem problema: a gente cria um e-mail para o cliente.</p> },
        { titulo: '“O comprovante está no nome do meu filho.”', corpo: <p>Peça o documento com foto dessa pessoa e faça a declaração de residência. A regra completa do comprovante está na lição 12.</p> },
        { titulo: '“Por que a foto do rosto?”', corpo: <p>Para confirmar que é a própria pessoa fazendo, e não outra pessoa usando o nome dela.</p> },
        { titulo: '“Por que tanto documento?”', corpo: <p>É a documentação básica do procedimento, nada fora do normal.</p> },
      ]} />
      <Aviso titulo="De quando pode ser o comprovante de residência?">
        A regra que você usa no atendimento: <b>do mês atual ou do mês passado</b>. Comprovante atrasado não serve. Se o cliente
        perguntar, responda assim, de forma simples. Os detalhes estão na lição 12.
      </Aviso>
    </Secao>

    <Secao titulo="“Pré-aprovada”: conduza com honestidade">
      <p>
        Esta é a parte mais delicada do canal de empréstimo. A IA mandou: “Boa notícia, José! Sua análise foi <b>pré-aprovada</b>.”
        Para quem precisa de dinheiro, a frase soa como “o dinheiro vai sair”. Mas repare em <b>quando</b> ela é enviada: logo
        depois das 3 portas. Ou seja, ela confirma que a <b>análise inicial passou nas perguntas</b> e que dá para seguir. Ninguém
        olhou os extratos do cliente ainda, e a IA nunca falou em valor.
      </p>
      <PreAprovadaEeNao />
      <p>
        E aqui está o ponto: a maioria de quem vem por esse canal <b>não tem margem disponível</b> para um consignado novo. A margem
        é a parte do benefício que pode ser descontada para pagar os consignados (empréstimos e cartões); quando ela já está toda
        usada, não sai um novo (a lição 3 explica a margem em detalhe). E você só sabe disso com segurança depois de
        conferir os extratos do INSS.
      </p>
      <Figura tag="Diagrama" legenda="O cliente acha que está no fim do caminho. Na verdade, está no começo. O seu trabalho é mostrar isso com calma.">
        <ReguaPreAprovada />
      </Figura>
      <h4 className="mv-cn-sub">O seu primeiro passo, sempre nesta ordem <span>canal de empréstimo</span></h4>
      <p>Quando a IA passa a conversa para você, siga esta sequência. Ela vale para todo cliente que chega pelo canal de empréstimo:</p>
      <Passos itens={[
        { titulo: 'Apresente-se', texto: 'Diga o seu nome e que é da CAF. O cliente estava esperando “um analista em instantes”: agora ele sabe que é você.' },
        { titulo: 'Explique a pré-aprovada com honestidade', texto: 'A análise inicial passou nas perguntas; isso não é valor liberado. Não diga “foi aprovado” e não cite valor nenhum.' },
        { titulo: 'Faça uma pergunta aberta e curta', texto: 'Sobre o que a pessoa precisa: “Me conta, o que o senhor está precisando hoje?”. A resposta mostra o que pesa para ela e ajuda a escolher o caminho depois.' },
        { titulo: 'Peça os extratos do Meu INSS', texto: 'É com eles que você confere a situação real: os consignados e a margem. Como pegar cada extrato está na lição 10.' },
      ]} />
      <p>
        Só depois de conferir os extratos vem a resposta. Se não houver margem para um consignado novo, diga isso com clareza e
        apresente os caminhos, sempre como possibilidade. Do lado dos consignados: o <b>aumento de margem</b> e a <b>portabilidade
        dos consignados</b> (que pode liberar um valor acima de R$&nbsp;1.500). Do lado do empréstimo pessoal que ele já tem: o
        <b> processo de revisão dos juros</b>. Se houver margem, combine o próximo passo com o seu gestor.
      </p>
      <BomRuim
        ruim={{
          titulo: 'Evite',
          corpo: (
            <Lista tom="nao" itens={[
              '“Foi aprovado, sim! Me manda os documentos que o dinheiro já sai.”',
              '“Deve sair uns 5 mil para o senhor.” (qualquer valor, antes de verificar)',
              'Sumir da conversa quando descobre que o cliente não tem margem.',
              'Falar do processo como se fosse o empréstimo, para o cliente não perceber a diferença.',
              'Dizer que a revisão é dos consignados dele. O processo revisa os juros do empréstimo pessoal.',
            ]} />
          ),
        }}
        bom={{
          titulo: 'Faça assim',
          corpo: (
            <Lista tom="sim" itens={[
              '“A pré-aprovação quer dizer que a sua análise inicial passou nas primeiras perguntas. Ainda não é valor liberado: preciso conferir os seus extratos do INSS.”',
              'Contar a verdade sobre a margem, com calma, e logo em seguida mostrar os caminhos.',
              'Explicar que o processo é outra coisa: a revisão dos juros do empréstimo pessoal que o cliente já tem com a financeira. O advogado entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise, e o cliente não paga nada para começar.',
            ]} />
          ),
        }}
      />
      <p>Veja como isso fica numa conversa de verdade, antes e depois de conferir os extratos:</p>
      <Conversa
        titulo="Antes de verificar: o primeiro passo"
        nota="Sugestão de roteiro, adapte ao cliente."
        falas={[
          { quem: 'cliente', texto: 'Oi! Já foi aprovado, né? Quanto vou receber?' },
          { quem: 'eu', texto: 'Oi, seu José! Aqui é [seu nome], analista da CAF. Vou cuidar do seu caso a partir de agora.' },
          { quem: 'eu', texto: 'A pré-aprovação quer dizer que a sua análise inicial passou nas primeiras perguntas. Ainda não é um valor liberado: primeiro eu vou conferir a sua situação.' },
          { quem: 'eu', texto: 'Me conta, o que o senhor está precisando hoje?' },
          { quem: 'cliente', texto: 'Queria um dinheiro para arrumar o telhado.' },
          { quem: 'eu', texto: 'Entendi. Para ver o que é possível no seu caso, preciso dos seus extratos do Meu INSS. Eu te ajudo a pegar, passo a passo. Combinado?' },
        ]}
      />
      <Conversa
        titulo="Depois de verificar: quando não há margem"
        nota="Sugestão de roteiro, adapte ao cliente. Como conduzir cada caminho está na lição 7."
        falas={[
          { quem: 'eu', texto: 'Seu José, conferi os seus extratos. Hoje a sua margem está toda comprometida com os consignados que o senhor já tem. Por isso não sai um consignado novo agora.' },
          { quem: 'cliente', texto: 'Ah, então não dá nada?' },
          { quem: 'eu', texto: 'Tem caminhos, sim. Dá para analisar a possibilidade de aumentar a sua margem, ou de levar os seus consignados para outro banco, que é a portabilidade. Ela pode liberar um valor acima de R$\u00a01.500.' },
          { quem: 'eu', texto: 'E tem mais uma coisa. O senhor contou que tem empréstimo pessoal no Mercantil e no BMG: aquele que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício. Os juros desse empréstimo podem ser analisados.' },
          { quem: 'eu', texto: 'O nosso advogado, o Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise, e o senhor não paga nada para começar. Posso te explicar como funciona?' },
        ]}
      />
      <Aviso tom="rubro" titulo="Nunca prometa">
        Nunca confirme valor, nunca diga que o empréstimo ou a portabilidade vão sair e nunca diga que o processo garante dinheiro.
        Fale em análise e em possibilidade. Prometer o que não depende de você é o jeito mais rápido de perder a confiança do
        cliente e de criar um problema sério para a empresa. Se o cliente reclamar (“mas o robô disse que estava aprovado!”),
        a resposta para essa objeção está na lição 8.
      </Aviso>
      <TesteRapido
        pergunta="O cliente do empréstimo escreve: “Já foi aprovado, né? Quando cai o dinheiro?” Qual a melhor resposta?"
        opcoes={[
          '“Foi sim! Me manda os documentos que o valor já cai na conta.”',
          '“Isso quem disse foi o robô, eu não sei te informar nada.”',
          '“Ainda não é valor liberado: preciso conferir os seus extratos.”',
        ]}
        certa={2}
        explica="Acolha, explique o que a pré-aprovação significa e mostre o próximo passo: conferir os extratos. Sem prometer e sem jogar a responsabilidade para o robô."
      />
    </Secao>
    <Secao titulo="O caminho completo, canal por canal">
      <p>
        Agora junte tudo. Escolha o canal e toque em cada etapa para ver o que acontece e quem faz. Repare onde a venda acontece em
        cada um: no canal de juros, é quando você confirma e explica; no de empréstimo, é quando você verifica e convence.
      </p>
      <FluxoPorCanal />
    </Secao>

    <Secao titulo="Quando o cliente responde NÃO ao robô">
      <p>
        Nem todo mundo topa na hora. No canal de juros, se o cliente responde NÃO, o robô responde sozinho, com esta mensagem:
      </p>
      <div className="mv-cn-cel-grade">
        <Celular contato="CAF" bolhas={CEL_NAO} legenda="Canal de juros: a resposta automática quando o cliente diz NÃO." />
        <div className="mv-cn-anot-tx">
          <p>
            Repare no tom: <b>sem pressão e com a porta aberta</b>. O robô lembra que a análise é gratuita e diz como voltar: é só
            mandar um SIM.
          </p>
          <p>
            É exatamente o comportamento que a CAF espera de você. A regra da casa é simples: <b>quando o cliente diz não, ou
            quando não é elegível, a gente agradece com carinho e não insiste.</b>
          </p>
          <p>
            Por que não insistir? Porque o nosso cliente é, na maioria das vezes, uma pessoa mais velha, que já ouviu falar de
            muito golpe pelo telefone e pelo WhatsApp. Insistência é justamente o que um golpista faz. Respeitar o NÃO mostra que a
            CAF é séria, e deixa o cliente à vontade para voltar quando estiver pronto.
          </p>
        </div>
      </div>
      <p>
        A conduta vale para os <b>dois canais</b>: no de empréstimo também, se o cliente disser que não quer seguir, ou se a IA
        concluir que ele não é elegível, a resposta é agradecer e encerrar sem pressão.
      </p>
      <p>E se a conversa aparecer para você depois de um NÃO? Depende do que o cliente fez em seguida:</p>
      <ArvoreNao />
      <BomRuim
        ruim={{
          corpo: (
            <Lista tom="nao" itens={[
              '“Mas o senhor vai perder dinheiro se não fizer agora!”',
              'Mandar mensagem todo dia perguntando se ele pensou melhor.',
              'Criar urgência falsa: “só hoje”, “últimas vagas”.',
            ]} />
          ),
        }}
        bom={{
          corpo: (
            <Lista tom="sim" itens={[
              'Agradecer com carinho e deixar a porta aberta.',
              'Se ele voltar com uma dúvida, responder com calma e com a verdade.',
              'Se ele mandar SIM depois, seguir o atendimento normalmente.',
            ]} />
          ),
        }}
      />
      <TesteRapido
        pergunta="O cliente respondeu NÃO ao robô e não escreveu mais nada. O que você faz?"
        opcoes={[
          'Não insiste: a porta ficou aberta. Se ele voltar, atende com carinho',
          'Manda uma mensagem por dia perguntando se ele pensou melhor',
          'Avisa que a análise gratuita acaba hoje, para ele decidir logo',
        ]}
        certa={0}
        explica="Quando o cliente diz NÃO, a gente agradece e não insiste. Urgência falsa e mensagens repetidas são exatamente o que faz o cliente desconfiar."
      />
    </Secao>

    <Secao titulo="Resumo da lição">
      <Lista itens={[
        <>O cliente chega por <b>anúncio no Facebook</b>, em dois canais: <b>juros abusivos</b> (do Andrius), de quem já quer revisar os juros do empréstimo pessoal, com venda mais direta; e <b>empréstimo</b>, de quem quer um consignado novo (a maioria sem margem) e precisa ser convencido.</>,
        <>O <b>consignado</b> é descontado pelo INSS e depende de margem; o <b>empréstimo pessoal</b> é cobrado pela financeira, fora do INSS. <b>O processo revisa os juros do empréstimo pessoal.</b></>,
        <>Antes de você, o robô já pegou <b>nome e CPF</b>; no empréstimo, a IA também conferiu as <b>3 portas</b> e mandou a “pré-aprovada” e a lista de documentos. <b>Leia o histórico antes de escrever</b> e não repita perguntas.</>,
        <>No canal de juros, <b>as 3 portas são com você</b>, e o robô prometeu uma atualização “em alguns minutos”: cumpra.</>,
        <><b>“Pré-aprovada” não é dinheiro garantido.</b> Apresente-se, explique isso com honestidade, pergunte o que a pessoa precisa e peça os extratos. Só depois de conferir fale dos caminhos (aumento de margem, portabilidade dos consignados e a revisão dos juros do empréstimo pessoal), como possibilidade.</>,
        <>O cliente disse NÃO? <b>Agradeça com carinho e não insista.</b> A porta fica aberta.</>,
      ]} />
      <Frase>O robô abre a porta. Quem conquista a confiança é você.</Frase>
    </Secao>
  </>
);

const licao: Licao = {
  id: 'canais',
  modulo: 'venda',
  titulo: 'Os dois canais e o robô',
  resumo: 'De onde vem o cliente, a diferença entre o canal de juros abusivos e o de empréstimo (e entre consignado e empréstimo pessoal), o que o robô e a IA já conversaram antes de você e como continuar com honestidade.',
  minutos: 25,
  corpo,
  questoes: [
    {
      p: 'Qual é a principal diferença entre o cliente do canal de juros abusivos e o do canal de empréstimo?',
      o: [
        'O de juros quer um empréstimo novo; o de empréstimo já chega querendo entrar com o processo',
        'O de juros já quer a revisão; o de empréstimo quer dinheiro e precisa ser convencido',
        'Os dois querem a revisão dos juros; muda só o anúncio que cada um deles viu no Facebook',
      ],
      c: 1,
      e: 'Quem vem pelo tráfego do Andrius já quer a revisão dos juros do empréstimo pessoal: a venda é mais direta. Quem vem pelo de empréstimo quer dinheiro rápido (um consignado novo), a maioria sem margem, e precisa ser convencido.',
    },
    {
      p: 'No canal de empréstimo, a IA manda “Sua análise foi pré-aprovada”. O que isso quer dizer?',
      o: [
        'Que a análise inicial passou nas perguntas da IA; nenhum valor foi conferido ainda',
        'Que o banco já conferiu a margem e liberou um valor; só falta o cliente mandar os documentos',
        'Que o empréstimo está garantido e o dinheiro cai assim que o cliente assinar',
      ],
      c: 0,
      e: 'A pré-aprovada vem logo depois das 3 portas: a análise inicial passou nas perguntas. Não é valor liberado, e ninguém conferiu os extratos ainda.',
    },
    {
      p: 'Qual é a diferença entre o robô e a IA que conversam com o cliente antes de você?',
      o: [
        'Não há diferença: os dois mandam as mesmas mensagens fixas, nos dois canais',
        'O robô confere as 3 portas nos dois canais; a IA só manda o vídeo e a imagem de boas-vindas',
        'O robô manda mensagens fixas; a IA, só no canal de empréstimo, confere as 3 portas',
      ],
      c: 2,
      e: 'O robô segue sempre o mesmo roteiro, nos dois canais. A IA existe só no canal de empréstimo: confere as 3 portas, manda a pré-aprovada e a lista de documentos e passa a conversa para você.',
    },
    {
      p: 'O cliente respondeu NÃO ao robô e não escreveu mais nada. Qual é a conduta certa?',
      o: [
        'Mandar uma mensagem explicando melhor, porque talvez ele não tenha entendido a proposta',
        'Não insistir: o robô já respondeu sem pressão e deixou a porta aberta para um SIM',
        'Avisar que a análise gratuita acaba hoje, para ele decidir logo de uma vez',
      ],
      c: 1,
      e: 'Quando o cliente diz NÃO, a gente agradece com carinho e não insiste. Mandar mais uma mensagem para convencer e criar urgência falsa são insistência. Se ele mandar SIM depois, o atendimento segue.',
    },
    {
      p: 'Você conferiu os extratos e o cliente do canal de empréstimo não tem margem. O que você faz?',
      o: [
        'Mostra os caminhos do consignado e a revisão dos juros do empréstimo pessoal dele',
        'Promete que a portabilidade vai liberar R$ 1.500 para ele',
        'Encerra com carinho, porque sem margem a CAF não tem mais nada para oferecer a ele',
      ],
      c: 0,
      e: 'Sem margem é justamente quando entram os caminhos: aumento de margem e portabilidade dos consignados e o processo de revisão dos juros do empréstimo pessoal. Sempre como possibilidade, nunca como promessa.',
    },
  ],
  glossario: [
    { termo: 'Tráfego pago', def: 'Anúncio pago em redes sociais, como o Facebook, para aparecer para um público escolhido. É de onde vêm os nossos clientes.' },
    { termo: 'Lead', def: 'Pessoa que mostrou interesse (por exemplo, tocou no anúncio e abriu a conversa) e ainda não fechou. É um possível cliente.' },
    { termo: 'Canal', def: 'Cada porta de entrada dos clientes. A CAF tem dois: o de juros abusivos (do Andrius), de quem quer revisar os juros do empréstimo pessoal, e o de empréstimo, de quem quer um consignado novo.' },
    { termo: 'Robô (fluxo automático)', def: 'Sequência de mensagens fixas que o nosso sistema manda sozinho no WhatsApp, sempre na mesma ordem: boas-vindas, vídeo ou imagem, SIM ou NÃO, nome e CPF.' },
    { termo: 'IA de atendimento', def: 'Assistente automático que conversa de forma mais livre. No canal de empréstimo, confere as 3 portas, manda a pré-aprovada e a lista de documentos e passa a conversa para um analista. Nunca cita valores, taxas ou juros.' },
    { termo: 'Pré-aprovada', def: 'Mensagem da IA no canal de empréstimo, enviada depois das 3 portas. Quer dizer que a análise inicial passou nas perguntas e dá para seguir. Não é valor liberado nem empréstimo garantido.' },
  ],
  mensagens: [
    {
      titulo: 'Explicar a pré-aprovação com honestidade',
      quando: 'Quando a IA passa a conversa para você e o cliente quer saber quanto vai receber ou quando o dinheiro cai.',
      texto: 'Olá, [nome do cliente]! Aqui é [seu nome], analista da CAF. Vou cuidar do seu atendimento a partir de agora.\n\nA pré-aprovação quer dizer que a sua análise inicial passou nas primeiras perguntas. Ainda não é um valor liberado: primeiro eu vou conferir a sua situação.\n\nMe conta: o que você está precisando hoje?\n\nPara eu ver o que é possível no seu caso, vou precisar dos seus extratos do Meu INSS. Eu te ajudo a pegar, passo a passo.',
    },
    {
      titulo: 'Sem margem: apresentar os caminhos',
      quando: 'Depois de conferir os extratos, quando o cliente do empréstimo não tem margem.',
      texto: 'Conferi os seus extratos, [nome do cliente]. Hoje a sua margem está toda comprometida com os consignados que você já tem, por isso não sai um consignado novo agora.\n\nMas existem caminhos que podemos analisar: a possibilidade de aumentar a sua margem e a portabilidade dos seus consignados para outro banco (que pode liberar um valor acima de R$\u00a01.500).\n\nE tem mais um: a revisão dos juros do empréstimo pessoal que você já tem com a financeira (aquele que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício). O advogado entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise.\n\nPara começar você não paga nada: os honorários do advogado (30%) só saem no final, do valor que você receber. Posso te explicar cada caminho?',
    },
    {
      titulo: 'Cliente disse não',
      quando: 'Quando o cliente responde que não quer seguir. Agradeça e deixe a porta aberta, sem insistir.',
      texto: 'Tudo bem, [nome do cliente]! Obrigado(a) pela atenção. Se mudar de ideia, é só me chamar aqui. A análise é gratuita e fica à sua disposição. Tenha um ótimo dia!',
    },
  ],
};
export default licao;
