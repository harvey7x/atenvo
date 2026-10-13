/* Lição 1 — Boas-vindas e como usar o manual.
   Recepção do estagiário: a CAF em 1 minuto, o papel do atendente (robô ×
   você × advogado), o mapa do manual, como estudar, o caminho do cliente, o
   dia do atendente em visão geral, os 4 valores e as 10 regras de ouro.
   Fatos da empresa: só os do brief do dono (13/10/2026) e do processo oficial.
   Assuntos de outras lições aparecem em 1–2 frases com "veja a lição N".
   Números da prova vêm de tipos.ts (via PROVA, em 01-boas-vindas-dados): nunca os escreva fixos no texto. */
import { MODULOS, type Licao } from '../tipos';
import {
  Aviso, BomRuim, Celular, Fatos, Figura, Frase, LinhaTempo, Lista, Passos, Sanfona, Secao, Tabela, TesteRapido,
} from '../pecas';
import {
  AntesDeVoce, CaminhoCliente, ComoFunciona, ConsignadoXPessoal, ConsultaRapida, ConversasParalelo, DeQuemETarefa,
  Financeiras, ModulosDaTrilha, MsgExemplo, Pilares, ProximaLicao, QtdLicoes, QuemFazOQue, RegrasOuro,
  SimuladorNota, Sumario, TrilhaManual,
} from './01-boas-vindas-pecas';
import { notaDe, PROVA, SEC } from './01-boas-vindas-dados';
import './01-boas-vindas.css';

/* um acerto abaixo do mínimo, para o teste rápido da nota */
const QUASE = PROVA.minimo - 1;

const corpo = (
  <>
    <p className="mv-lead">
      Seja muito bem-vindo(a) à <b>CAF</b>! Este manual foi feito para quem está chegando agora: quem nunca viu um
      empréstimo consignado, não sabe o que é margem e nunca entrou no Meu INSS. Está tudo bem. Você vai aprender
      passo a passo, com exemplos, conversas de exemplo e muitos desenhos. Nesta primeira lição você vai entender,
      em visão geral, <b>o que a empresa faz</b>, <b>qual é o seu papel</b>, <b>como o cliente caminha</b> do anúncio
      até o ressarcimento e <b>como estudar este manual</b> para chegar pronto à prova final.
    </p>

    <Sumario />

    {/* ================================================================ 1. A CAF em 1 minuto */}
    <Secao titulo="A CAF em 1 minuto" id={SEC.caf}>
      <p>
        CAF quer dizer <b>Central de Assessoria Financeira</b>. O nosso serviço principal, o “carro-chefe” da empresa,
        é o <b>processo de ressarcimento de juros abusivos</b>. Em palavras simples: muita gente que recebe benefício
        do INSS fez um <b>empréstimo pessoal</b> com uma financeira. É um contrato direto com a financeira, fora do
        INSS, e os juros dele são livres, em geral bem mais altos que os do consignado. Quando esses juros são
        abusivos, a pessoa paga mais do que deveria, e nem sempre consegue perceber isso sozinha.
      </p>
      <p>
        É aí que a gente entra. O cliente nos procura, a gente confere se ele pode ser atendido e junta a documentação.
        Com tudo pronto, o nosso advogado, o <b>Dr. Rafael Menezes</b>, entra com uma ação pedindo o
        <b> ressarcimento do que foi descontado nos últimos 10 anos</b> nesses empréstimos pessoais. Veja o caminho
        em 4 etapas:
      </p>
      <Figura legenda="Como funciona o processo, do empréstimo pessoal com a financeira até o resultado. Valores do exemplo são ilustrativos.">
        <ComoFunciona />
      </Figura>

      <h4 className="mv-bv-h4">Consignado ou empréstimo pessoal? Não confunda</h4>
      <p>
        Há dois tipos de empréstimo bem diferentes que o cliente costuma confundir e chamar só de “empréstimo”.
        O <b>consignado</b> é descontado direto do benefício <b>pelo INSS</b>, antes de o dinheiro cair na conta, e
        tem um teto de juros. O <b>empréstimo pessoal</b> não passa pelo INSS: é cobrado <b>pela financeira</b>, em
        geral na conta do cliente ou por boleto, com juros livres. <b>O nosso processo olha os juros do empréstimo
        pessoal.</b> O consignado aparece em outra parte do trabalho: no canal de empréstimo, quando o cliente quer um
        consignado novo e está sem margem. Veja a diferença num desenho (a lição 3 explica tudo em detalhe):
      </p>
      <Figura legenda="Os dois empréstimos lado a lado. O consignado passa pelo INSS; o empréstimo pessoal é cobrado pela financeira, fora do INSS. É o pessoal que a CAF revisa.">
        <ConsignadoXPessoal />
      </Figura>
      <p>
        Por que alguém faria o empréstimo mais caro? Um motivo comum: o consignado depende de <b>margem</b>, e quem está sem
        margem para consignado muitas vezes recorre ao empréstimo pessoal, que não usa a margem e é mais caro. É sobre
        os juros desse empréstimo, o pessoal, que o nosso advogado entra com a ação.
      </p>
      <TesteRapido
        pergunta="O cliente conta: “Tenho um empréstimo no Agibank que eles cobram direto na minha conta; o INSS não desconta nada.” Pelo que ele descreve, que empréstimo é esse?"
        opcoes={['Um consignado, porque é com uma financeira', 'Um empréstimo pessoal, cobrado fora do INSS', 'Nenhum dos dois: só se sabe no fim do processo']}
        certa={1}
        explica="O consignado é descontado pelo INSS, direto do benefício. Quando quem cobra é a financeira, na conta ou por boleto, fora do INSS, é empréstimo pessoal: é esse que o nosso processo revisa. Ter o nome de uma das 5 financeiras não basta para saber o tipo: o BMG, por exemplo, também tem consignado."
      />
      <p>
        Quatro números resumem o que você vai repetir muitas vezes para os clientes. Eles respondem às perguntas que
        mais aparecem: “quanto tempo demora?”, “preciso pagar alguma coisa para começar?” e “quanto fica para o
        advogado?”. Aqui é só o mapa: a lição 2 explica cada número e como falar dele com o cliente.
      </p>
      <Fatos itens={[
        { grande: '10 anos', texto: 'O processo pede o ressarcimento do que foi descontado nos últimos 10 anos, nos empréstimos pessoais.' },
        { grande: '6 a 12 meses', texto: 'É o tempo médio do processo até o ressarcimento. Fale sempre em “em média”.' },
        { grande: 'R$ 0', texto: 'O cliente não paga nada para começar. O processo é gratuito no início.' },
        { grande: '30%', texto: 'Honorários do advogado, só no final, retirados do que o cliente receber. O percentual é sempre o mesmo.' },
      ]} />
      <p>
        O cliente chega querendo revisar os juros do <b>empréstimo pessoal</b> que fez em alguma destas cinco
        financeiras. Três delas são as que mais aparecem no dia a dia, então você vai ouvir muito esses nomes:
      </p>
      <Financeiras />
      <p>
        Repare: o que importa para o processo é o <b>empréstimo pessoal</b> nessas financeiras, não o simples nome do
        banco. Algumas delas também têm outros produtos (o BMG, por exemplo, também tem consignado e cartão
        consignado). A lição 4 mostra como perguntar isso ao cliente de um jeito simples.
      </p>
      <p>
        E como o cliente chega até a gente? Pelos nossos <b>anúncios no Facebook</b> (tráfego pago), feitos para
        aposentados e pensionistas do INSS. A pessoa vê o anúncio, chama a CAF no WhatsApp e é recebida primeiro por um
        robô. Hoje são <b>dois tráfegos</b>: o de <b>juros abusivos</b> (o tráfego do Andrius), em que o cliente já quer
        a revisão, e o de <b>empréstimo</b>, em que o cliente quer dinheiro rápido. A diferença aparece logo abaixo, e a
        lição 5 trata dos dois canais em detalhe.
      </p>
      <Frase>
        A CAF ajuda quem recebe benefício do INSS e paga juros abusivos num empréstimo pessoal com as financeiras a
        pedir, com o nosso advogado, o ressarcimento do que foi descontado nos últimos 10 anos, sem pagar nada para
        começar.
      </Frase>
    </Secao>

    {/* ================================================================ 2. O seu papel */}
    <Secao titulo="O seu papel: onde você entra" id={SEC.papel}>
      <p>
        Pense no atendimento como uma <b>corrida de revezamento</b>. O robô corre o primeiro trecho: dá as boas-vindas
        e pega o nome e o CPF (no canal de empréstimo, uma IA ainda confere as 3 portas). Aí ele passa o bastão para
        <b> você</b>, que corre a maior parte do caminho. No fim, você entrega o caso pronto para o <b>advogado</b>,
        que leva até a linha de chegada.
      </p>
      <Figura legenda="Quem faz o quê. Você fica no meio, e é a parte mais longa do caminho.">
        <QuemFazOQue />
      </Figura>
      <p>
        O seu trabalho cabe em <b>quatro verbos</b>: <b>qualificar</b> (ver se a pessoa pode ser atendida),
        <b> convencer</b> (explicar o processo até o cliente confiar e querer seguir), <b>coletar os documentos</b> e
        <b> encaminhar</b> para o processo (cadastro, procurações e assinatura). Cada verbo tem lições próprias neste
        manual. Por enquanto, guarde a ordem: sem qualificar, não adianta convencer; sem convencer, o cliente não manda
        documento; sem documento, não tem processo.
      </p>

      <h4 className="mv-bv-h4">O momento em que você assume</h4>
      <p>
        Veja como chega uma conversa do canal de juros abusivos. Tudo o que está marcado como “Mensagem automática” foi
        enviado pelo robô, com as palavras exatas que ele usa. A última mensagem é a sua. Repare que você pergunta pelo
        benefício do INSS logo de cara: no canal de juros abusivos, o robô <b>não</b> confere as 3 portas, isso é com
        você. E qualquer benefício do INSS serve (aposentadoria, pensão, auxílio, BPC/LOAS), não só a aposentadoria.
        Ao lado, o que já aconteceu e o que fica com você.
      </p>
      <div className="mv-bv-antes">
        <Celular
          contato="Maria (cliente)"
          sub="exemplo · canal de juros abusivos"
          legenda="Nome e CPF fictícios. Mensagens do robô com as palavras exatas; a última (a sua) é sugestão de roteiro."
          bolhas={[
            { de: 'robo', texto: 'Olá! Seja bem-vindo(a) à CAF! 👋' },
            { de: 'robo', tipo: 'video', legenda: 'Assista esse video, leva apenas 30 segundos.' },
            { de: 'robo', texto: 'Gostaria de fazer *análise gratuita* pra descobrir se você paga juros abusivos e recuperar valores?' },
            { de: 'robo', texto: 'Responda *SIM* ou *NÃO* 😊' },
            { de: 'cliente', texto: 'SIM' },
            { de: 'robo', texto: 'Ótima decisão! 👏' },
            { de: 'robo', texto: 'Para iniciarmos sua análise, me informe seu nome completo:' },
            { de: 'cliente', texto: 'Maria Aparecida dos Santos' },
            { de: 'robo', texto: 'Poderia me informar seu *CPF*?' },
            { de: 'robo', texto: '🔒 Seus dados são usados somente para a consulta. *Nunca pedimos senhas, códigos ou qualquer pagamento.*' },
            { de: 'cliente', texto: '123.456.789-00' },
            { de: 'robo', texto: '✅ Recebido, Maria!' },
            { de: 'robo', texto: 'Sua análise foi iniciada. Em alguns minutos retorno aqui com uma atualização.' },
            { de: 'eu', texto: 'Olá, Dona Maria! Aqui é [seu nome], da CAF. Vou continuar a sua análise a partir de agora. Para começar, a senhora recebe algum benefício do INSS, como aposentadoria, pensão ou auxílio?' },
          ]}
        />
        <AntesDeVoce />
      </div>
      <p>
        No canal de <b>empréstimo</b> o começo é parecido, mas a IA vai mais longe: ela confere as 3 portas (benefício
        do INSS, familiar e empréstimo pessoal nas financeiras), avisa que a análise foi <b>“pré-aprovada”</b>, manda a lista de documentos e
        pergunta se a pessoa usa o gov.br e o Meu INSS. Só então passa a conversa para um analista, que é você. A IA
        nunca fala de valores, taxas ou juros. Compare os dois canais (a lição 5 mostra o fluxo de cada um, mensagem por
        mensagem):
      </p>
      <Tabela
        colunas={['', 'Canal de juros abusivos', 'Canal de empréstimo']}
        destaque={0}
        linhas={[
          ['De onde vem', 'Tráfego do Andrius, no Facebook', 'Tráfego de empréstimo, no Facebook'],
          ['O que o cliente quer', 'Revisar os juros do empréstimo pessoal: já quer o processo', 'Dinheiro rápido: em geral, um consignado novo'],
          ['O que o robô já fez', 'Boas-vindas, vídeo, SIM ou NÃO, nome e CPF', 'Boas-vindas, SIM ou NÃO, nome, CPF, as 3 portas, “pré-aprovada”, a lista de documentos e a pergunta sobre o gov.br'],
          ['Como é a venda', 'Mais direta: o cliente já veio por isso', 'Precisa convencer: a maioria não tem margem para um consignado novo'],
          ['O que você apresenta', 'O processo: a revisão dos juros do empréstimo pessoal', 'Os caminhos (aumento de margem, portabilidade dos consignados) e a revisão dos juros do empréstimo pessoal'],
          ['Seu primeiro passo', 'Apresentar-se e conferir as 3 portas', 'Apresentar-se, explicar a “pré-aprovada”, perguntar o que a pessoa precisa e pedir os extratos do Meu INSS'],
        ]}
      />
      <Aviso tom="ambar" titulo="O “pré-aprovada” do canal de empréstimo">
        “Pré-aprovada” quer dizer que a análise inicial passou nas perguntas; não é valor liberado. Por isso o seu
        primeiro passo nesse canal é, nesta ordem: apresentar-se (seu nome e a CAF), explicar isso com honestidade,
        fazer uma pergunta aberta curta sobre o que a pessoa precisa e pedir os extratos do Meu INSS para conferir a
        situação (veja a lição 5).
      </Aviso>

      <h4 className="mv-bv-h4">Treino: de quem é essa tarefa?</h4>
      <p>Para cada tarefa, escolha quem faz: o robô, você ou o advogado. A explicação aparece logo depois.</p>
      <DeQuemETarefa />

      <TesteRapido
        pergunta="Um cliente chegou pelo canal de juros abusivos e o robô acabou de mandar “Sua análise foi iniciada”. O que ele já informou?"
        opcoes={['Nada ainda: você começa do zero', 'O nome completo e o CPF', 'Todos os documentos do Meu INSS']}
        certa={1}
        explica="O robô pede o nome completo e o CPF antes de passar a conversa. Os documentos ainda não foram pedidos: isso é com você, depois de qualificar e convencer."
      />
    </Secao>

    {/* ================================================================ 3. O mapa do manual */}
    <Secao titulo="O mapa do manual" id={SEC.mapa}>
      <p>
        O manual é uma <b>trilha</b>: são <b>{MODULOS.length} módulos</b> com <b><QtdLicoes /> lições</b> no total e, no
        fim, a <b>prova final</b>.
        Os módulos seguem a mesma ordem do atendimento: primeiro você entende o negócio, depois aprende a vender, depois
        a juntar os documentos e, por último, a fechar.
      </p>
      <Figura legenda="A trilha do manual. Clique em qualquer parada para ver o que aquela lição ensina.">
        <TrilhaManual />
      </Figura>
      <ModulosDaTrilha />
      <p>
        Fora da trilha, no menu à esquerda, fica a <b>consulta rápida</b>: cinco ferramentas para usar <b>durante</b> o
        atendimento, sem precisar reler uma lição inteira. Saiba quando abrir cada uma:
      </p>
      <ConsultaRapida />
    </Secao>

    {/* ================================================================ 4. Como estudar */}
    <Secao titulo="Como estudar este manual" id={SEC.estudar}>
      <p>
        O objetivo não é decorar. É <b>entender o porquê</b> de cada coisa, para você conseguir conversar com qualquer
        cliente, até com aquele que faz uma pergunta que não está aqui. Siga estes passos:
      </p>
      <Passos itens={[
        { titulo: 'Siga a ordem das lições', texto: 'Cada lição usa o que veio antes. Pular para os documentos sem entender o cliente deixa buracos que aparecem na hora de atender.' },
        { titulo: 'Leia com calma e mexa em tudo', texto: 'Clique nas trilhas, arraste as barras, faça os treinos. As atividades estão aqui para fixar o conteúdo, não para enfeitar.' },
        { titulo: 'Responda os testes rápidos', texto: 'Eles aparecem no meio das lições e não valem nota. Errou? Leia a explicação e tente de novo: é assim que se aprende.' },
        { titulo: 'Conclua cada lição', texto: 'No fim da lição, clique em “Concluir e seguir”. O seu progresso aparece no topo da tela, e a lição ganha um sinal de concluída no menu.' },
        { titulo: 'Faça a prova final', texto: `São ${PROVA.total} perguntas sorteadas de todas as lições. Para passar, é preciso acertar ${PROVA.pct}%. Pode refazer: cada tentativa faz um novo sorteio de perguntas e fica valendo a sua melhor nota.` },
        { titulo: 'No dia a dia, use a consulta rápida', texto: 'Checklist, calculadora de períodos, mapa da venda, mensagens prontas e glossário: é o seu apoio durante o atendimento.' },
      ]} />
      <h4 className="mv-bv-h4">Quanto é {PROVA.pct}% na prova?</h4>
      <p>
        Com {PROVA.total} perguntas, {PROVA.pct}% são <b>{PROVA.minimo} acertos</b>. A barra começa no mínimo para
        passar. Arraste para os lados e veja o que acontece com um acerto a mais ou a menos:
      </p>
      <SimuladorNota />
      <TesteRapido
        pergunta={`Você acertou ${QUASE} das ${PROVA.total} perguntas da prova final. E agora?`}
        opcoes={[
          'Passou, porque acertou mais da metade',
          `Ainda não (${notaDe(QUASE)}%): revisar e fazer outra prova`,
          'Precisa refazer todas as lições do zero',
        ]}
        certa={1}
        explica={`O mínimo é ${PROVA.pct}%, ou seja, ${PROVA.minimo} de ${PROVA.total}. Com ${QUASE} a nota é ${notaDe(QUASE)}%. Revise as lições em que errou e faça outra prova: as perguntas são sorteadas de novo e fica valendo a melhor nota.`}
      />
      <Aviso titulo="Onde fica o seu progresso">
        As lições concluídas e a sua melhor nota ficam salvas <b>neste navegador</b>, no seu usuário. Se você trocar de
        computador ou limpar os dados do navegador, o progresso pode não aparecer: é só concluir as lições de novo.
      </Aviso>
      <Sanfona itens={[
        {
          titulo: 'Preciso decorar tudo?',
          corpo: <p>Não. Entenda o porquê de cada etapa. Os detalhes (períodos, lista de documentos, textos prontos, o mapa da venda) ficam na consulta rápida para você consultar na hora.</p>,
        },
        {
          titulo: 'E se o cliente perguntar algo que não está no manual?',
          corpo: <p>Não invente. Diga ao cliente que vai confirmar a informação e pergunte ao seu gestor. Uma resposta inventada pode virar uma promessa que a CAF não tem como cumprir.</p>,
        },
        {
          titulo: 'Quanto tempo leva cada lição?',
          corpo: <p>O tempo estimado aparece no topo de cada lição e no menu. Não tenha pressa: é melhor uma lição bem entendida do que três lidas correndo.</p>,
        },
        {
          titulo: 'Errei um teste rápido. Isso conta na nota?',
          corpo: <p>Não. Os testes rápidos são só para você conferir se entendeu. Leia a explicação, clique em “Tentar de novo” e siga. Só a prova final tem nota.</p>,
        },
        {
          titulo: 'Posso voltar numa lição que já concluí?',
          corpo: <p>Pode e deve. Use o menu à esquerda a qualquer momento. Se quiser estudar de novo do jeito “não concluído”, use “Desmarcar como concluída” no fim da lição.</p>,
        },
      ]} />
    </Secao>

    {/* ================================================================ 5. O caminho do cliente */}
    <Secao titulo="O caminho do cliente, do anúncio ao ressarcimento" id={SEC.caminho}>
      <p>
        Agora olhe o processo do ponto de vista do cliente. Ele passa por <b>10 paradas</b>. As duas primeiras acontecem
        antes de você; as seis do meio são com você; as duas últimas são com o advogado.
      </p>
      <Figura legenda="O caminho do cliente em 10 paradas, separado por quem cuida de cada trecho.">
        <CaminhoCliente />
      </Figura>
      <p>Cada trecho do caminho, explicado:</p>
      <div className="mv-duas">
        <div className="vidro mv-cartao" data-tom="azul">
          <h4>A venda · paradas 3 e 4</h4>
          <p>
            Primeiro você confere se a pessoa pode ser atendida. Depois explica o processo com calma: gratuito para
            começar, 30% só no final, em média de 6 a 12 meses. No canal de empréstimo, depois de olhar os extratos, é
            aqui que você mostra a situação com honestidade (muitas vezes, sem margem para um consignado novo) e os
            caminhos possíveis: aumento de margem, portabilidade dos consignados e a revisão dos juros do empréstimo
            pessoal.
          </p>
        </div>
        <div className="vidro mv-cartao" data-tom="ambar">
          <h4>Os documentos · paradas 5 a 7</h4>
          <Lista itens={[
            <><b>Meu INSS:</b> carta de concessão, Extrato de Empréstimo Consignado e extratos de pagamento dos últimos 10 anos.</>,
            <><b>gov.br:</b> imposto de renda dos últimos 3 anos e situação cadastral do CPF.</>,
            <><b>Pessoais:</b> identidade, foto do rosto, comprovante de residência (mês atual ou passado) e e-mail.</>,
          ]} />
          <p className="mv-bv-nota-doc">
            Essa é a ordem sugerida, mas não é rígida: o cliente pode mandar primeiro o que tiver em mãos. Se a análise
            segue pelo benefício de um familiar, os documentos são do familiar que recebe; na dúvida, pergunte ao gestor.
          </p>
        </div>
        <div className="vidro mv-cartao" data-tom="azul">
          <h4>O fechamento · parada 8</h4>
          <p>
            Com tudo em mãos, o cliente é cadastrado no sistema, que gera as procurações. O cliente assina digitalmente
            pelo gov.br, e para isso a conta dele precisa estar no nível <b>prata ou ouro</b>. Bronze não assina.
          </p>
        </div>
        <div className="vidro mv-cartao" data-tom="verde">
          <h4>O advogado · paradas 9 e 10</h4>
          <p>
            O Dr. Rafael Menezes entra com a ação. O processo leva em média de 6 a 12 meses. Se houver ressarcimento,
            os honorários de 30% saem do valor que o cliente receber, no final.
          </p>
        </div>
      </div>
      <p>
        Repare no tamanho do trecho do meio: a maior parte do caminho passa por você. A maioria dos clientes não sabe
        entrar no Meu INSS, então a sua paciência na parte dos documentos faz muita diferença.
      </p>
      <TesteRapido
        pergunta="Qual é a ordem certa do seu trabalho com um cliente?"
        opcoes={[
          'Qualificar → convencer → documentos → cadastro e procurações',
          'Convencer → procurações → qualificar → documentos',
          'Documentos → qualificar → procurações → convencer',
        ]}
        certa={0}
        explica="Primeiro confira se a pessoa pode ser atendida, depois explique e convença, então junte os documentos e, por fim, cadastro, procurações e assinatura."
      />
    </Secao>

    {/* ================================================================ 6. O dia do atendente */}
    <Secao titulo="O dia do atendente, em visão geral" id={SEC.dia}>
      <p>
        Não existe um dia igual ao outro. Mas <b>toda conversa passa pelas mesmas cinco etapas</b>, e saber em qual delas
        cada cliente está é o que organiza o seu trabalho:
      </p>
      <LinhaTempo itens={[
        { quando: 'Etapa 1', titulo: 'Chega uma conversa', texto: 'O robô já deu as boas-vindas e pegou nome e CPF. O cliente está esperando: apresente-se logo e continue de onde o robô parou. No canal de empréstimo, explique a “pré-aprovada”, pergunte o que a pessoa precisa e peça os extratos do Meu INSS.' },
        { quando: 'Etapa 2', titulo: 'Qualificar', texto: 'Confira as 3 portas: benefício do INSS (dele ou de um familiar) e empréstimo pessoal numa das 5 financeiras. No canal de empréstimo, a IA já perguntou, e você confere a situação nos extratos. Não passou? Agradeça com carinho e encerre (lição 4).' },
        { quando: 'Etapa 3', titulo: 'Conversar e convencer', texto: 'Explique o processo com palavras simples e responda às dúvidas. No canal de empréstimo, mostre com honestidade os caminhos possíveis: aumento de margem, portabilidade dos consignados e a revisão dos juros do empréstimo pessoal.' },
        { quando: 'Etapa 4', titulo: 'Documentos', texto: 'Meu INSS, gov.br e documentos pessoais. Um pedido de cada vez, com paciência, conferindo se cada documento veio certo.' },
        { quando: 'Etapa 5', titulo: 'Fechamento', texto: 'Cadastro, procurações e assinatura pelo gov.br (conta prata ou ouro). Depois, o caso segue com o advogado.' },
      ]} />
      <p>
        Na prática, é comum ter <b>várias conversas abertas ao mesmo tempo</b>, cada uma numa etapa diferente. Um jeito
        bom de pensar o seu dia é como um quadro: cada cliente numa coluna, cada um com um <b>próximo passo</b> claro.
      </p>
      <Figura tag="Exemplo" legenda="Um jeito de enxergar as suas conversas: cada uma numa etapa, cada uma com o próximo passo. Nomes fictícios.">
        <ConversasParalelo />
      </Figura>
      <Aviso titulo="O que este manual não define">
        Horários, metas e a rotina da equipe são combinados com o seu gestor. Este manual cuida do <b>como atender</b>:
        o que falar, o que pedir e o que nunca fazer.
      </Aviso>
    </Secao>

    {/* ================================================================ 7. Valores */}
    <Secao titulo="Os 4 valores do nosso atendimento" id={SEC.valores}>
      <p>
        Regras ajudam, mas não cobrem tudo. Quando aparecer uma situação nova, volte nestes quatro valores: se a sua
        resposta respeita os quatro, provavelmente ela está certa.
      </p>
      <Pilares />
      <p>
        Veja como os valores aparecem numa única mensagem. As duas tentam fazer a mesma coisa (assumir a conversa), mas
        só uma respeita o cliente. A mensagem boa é uma sugestão de roteiro: adapte ao cliente.
      </p>
      <BomRuim
        ruim={{
          titulo: 'Evite',
          corpo: (
            <MsgExemplo tom="ruim"
              texto="oi td bem? sua analise deu bom!! vc vai receber uns 15 mil fácil kkk manda os docs ai rapidinho q hj é o ultimo dia"
              pontos={['Gíria e abreviação: o cliente idoso não entende', 'Promete valor: ninguém sabe o resultado antes da análise', 'Urgência falsa: pressiona e parece golpe']} />
          ),
        }}
        bom={{
          titulo: 'Faça assim',
          corpo: (
            <MsgExemplo tom="bom"
              texto="Olá, Dona Maria! Aqui é [seu nome], da CAF. Vou continuar a sua análise a partir de agora. Para começar, a senhora recebe algum benefício do INSS, como aposentadoria, pensão ou auxílio?"
              pontos={['Se apresenta e diz de onde fala', 'Frases curtas, com respeito', 'Não promete nada e dá um passo de cada vez']} />
          ),
        }}
      />
    </Secao>

    {/* ================================================================ 8. Regras de ouro */}
    <Secao titulo="As 10 regras de ouro" id={SEC.regras}>
      <p>
        Estas são as regras que valem em <b>qualquer</b> conversa, em qualquer canal, com qualquer cliente. Toque em
        cada uma para ver o porquê. Elas voltam ao longo do manual, cada uma com mais detalhes na lição certa.
      </p>
      <RegrasOuro />
      <TesteRapido
        pergunta="O cliente faz uma pergunta que você ainda não sabe responder. O que fazer?"
        opcoes={[
          'Responder do jeito que parecer mais certo',
          'Dizer que vai confirmar e perguntar ao gestor',
          'Mudar de assunto e pedir os documentos',
        ]}
        certa={1}
        explica="Regra 10: na dúvida, pergunte; nunca invente. Diga ao cliente que vai confirmar e fale com o seu gestor. Uma resposta inventada pode virar uma promessa que a CAF não tem como cumprir. A mensagem pronta “Quando você não sabe a resposta” ajuda nessa hora."
      />
      <Frase>Na dúvida entre vender mais e ser honesto, seja honesto. Cliente que confia manda os documentos.</Frase>
    </Secao>

    {/* ================================================================ 9. Resumo */}
    <Secao titulo="Resumo da lição" id={SEC.resumo}>
      <Lista itens={[
        <>A <b>CAF</b> (Central de Assessoria Financeira) tem como carro-chefe o <b>processo de ressarcimento de juros abusivos</b> dos <b>empréstimos pessoais</b> que quem recebe benefício do INSS fez com Agibank, BMG, Facta, Mercantil ou Crefisa.</>,
        <>Não confunda: o <b>consignado</b> é descontado pelo INSS, direto do benefício, e tem teto de juros; o <b>empréstimo pessoal</b> é cobrado pela financeira, fora do INSS, com juros livres. O processo revisa o <b>pessoal</b>; o consignado (margem, aumento de margem, portabilidade) é o gancho do canal de empréstimo.</>,
        <>O cliente <b>não paga nada para começar</b>. No final, <b>30%</b> do que ele receber ficam como honorários do advogado, o Dr. Rafael Menezes. O processo leva <b>em média de 6 a 12 meses</b> e pede o ressarcimento dos <b>últimos 10 anos</b>.</>,
        <>O <b>robô</b> começa a conversa e pega nome e CPF (no canal de empréstimo, a <b>IA</b> ainda confere as 3 portas). <b>Você</b> assume e faz quatro coisas: <b>qualificar, convencer, coletar documentos e encaminhar</b>. O <b>advogado</b> entra com a ação.</>,
        <>Os 4 valores: <b>respeito ao idoso, honestidade, rapidez e segurança dos dados</b>. O que nunca se faz: prometer valor, pedir dinheiro ao cliente, insistir com quem disse não e inventar resposta.</>,
        <>Estude <b>na ordem</b>, faça os testes rápidos e a <b>prova final</b> ({PROVA.pct}%, ou {PROVA.minimo} de {PROVA.total}). No dia a dia, use a <b>consulta rápida</b>.</>,
      ]} />
      <ProximaLicao>
        Agora que você tem o mapa, a próxima lição abre o processo de ressarcimento em detalhe: como funciona a ação,
        os 10 anos, o prazo médio e como explicar os 30% de um jeito que o cliente entenda.
      </ProximaLicao>
    </Secao>
  </>
);

const licao: Licao = {
  id: 'boas-vindas',
  modulo: 'fundamentos',
  titulo: 'Boas-vindas e como usar o manual',
  resumo: 'O que a CAF faz, qual é o seu papel no atendimento, o caminho do cliente e como estudar até a prova final.',
  minutos: 32,
  corpo,
  questoes: [
    {
      p: 'No canal de juros abusivos, o que o robô avisa ao cliente pouco antes de você assumir a conversa?',
      o: ['Que a CAF nunca pede senhas, códigos ou pagamento', 'Que a análise libera um valor em poucos dias úteis', 'Que o advogado vai ligar para ele ainda hoje à tarde'],
      c: 0,
      e: 'Junto com o pedido do CPF, o robô escreve: “Nunca pedimos senhas, códigos ou qualquer pagamento.” Você herda essa promessa: nunca peça dinheiro, senha nem código.',
    },
    {
      p: 'No canal de juros abusivos, em que momento o atendente assume a conversa?',
      o: ['Assim que o cliente clica no anúncio, antes do robô', 'Quando o robô avisa que a análise foi iniciada', 'Depois que o cliente manda os extratos do INSS'],
      c: 1,
      e: 'O robô dá as boas-vindas, manda o vídeo, pergunta se o cliente quer a análise e pede nome e CPF. Depois do “Sua análise foi iniciada”, a conversa é sua. Os extratos você pede depois.',
    },
    {
      p: 'Quem entra com a ação pedindo o ressarcimento?',
      o: ['O atendente, depois de juntar os documentos', 'O gestor, assim que o cliente é cadastrado', 'O advogado da CAF, o Dr. Rafael Menezes'],
      c: 2,
      e: 'O atendente qualifica, convence, junta os documentos e encaminha. Quem entra com a ação é o nosso advogado, o Dr. Rafael Menezes.',
    },
    {
      p: 'Para que serve a Consulta rápida, no menu do manual?',
      o: ['Para refazer a prova final sempre que você quiser', 'Para apoiar o atendimento, sem reler a lição toda', 'Para mandar as mensagens ao cliente direto do manual'],
      c: 1,
      e: 'A Consulta rápida reúne checklist, calculadora de períodos, mapa da venda, mensagens prontas e glossário, para usar durante o atendimento. As mensagens você copia e envia pelo WhatsApp.',
    },
    {
      p: 'No canal de empréstimo, quem confere as 3 portas antes de a conversa chegar até você?',
      o: ['A IA do canal, antes de passar a conversa', 'Ninguém: nos dois canais, as 3 portas são com você', 'O advogado, assim que recebe o cadastro do cliente'],
      c: 0,
      e: 'No canal de empréstimo, a IA confere as 3 portas, avisa a “pré-aprovada” e só então passa a conversa. No canal de juros abusivos, as 3 portas ficam com você.',
    },
  ],
  glossario: [
    { termo: 'Robô e IA', def: 'O robô manda mensagens fixas nos dois canais (boas-vindas, nome e CPF). No canal de empréstimo, uma IA ainda confere as 3 portas e passa a conversa para você.' },
    { termo: 'Assumir a conversa', def: 'O momento em que o atendente continua o atendimento que o robô começou. O cliente já informou nome e CPF e está esperando uma resposta.' },
    { termo: 'Valores do atendimento', def: 'Respeito ao idoso, honestidade, rapidez e segurança dos dados. Numa situação nova, a resposta certa é a que respeita os quatro.' },
    { termo: 'Regras de ouro', def: 'As 10 regras que valem em qualquer conversa, em qualquer canal. Cada uma é explicada com mais detalhes na lição certa.' },
    { termo: 'Consulta rápida', def: 'A parte do menu do manual com ferramentas para usar durante o atendimento: checklist do cliente, calculadora de períodos, mapa da venda, mensagens prontas e glossário.' },
    { termo: 'Teste rápido', def: 'Pergunta de fixação no meio da lição. Não vale nota: serve para você conferir se entendeu e ler a explicação.' },
    { termo: 'Prova final', def: `A avaliação no fim da trilha: ${PROVA.total} perguntas sorteadas de todas as lições. Para passar, ${PROVA.pct}% de acertos. Pode refazer, e fica valendo a melhor nota.` },
  ],
  mensagens: [
    {
      titulo: 'Quando você não sabe a resposta',
      quando: 'O cliente perguntou algo que você ainda não domina. Confirme com o seu gestor antes de responder. Sugestão de roteiro: adapte ao cliente.',
      texto: 'Ótima pergunta, [nome do cliente]! Quero te responder certinho, então vou confirmar essa informação com a equipe e já te retorno aqui, tudo bem?',
    },
    {
      titulo: 'Avisar que já vai responder',
      quando: 'Você está com várias conversas abertas e não consegue responder com calma agora. Avise, em vez de deixar o cliente sem retorno. Sugestão de roteiro: adapte ao cliente.',
      texto: 'Oi, [nome do cliente]! Já vi a sua mensagem e estou cuidando do seu atendimento. Me dá só alguns minutinhos que já te respondo com calma, combinado?',
    },
  ],
};
export default licao;
