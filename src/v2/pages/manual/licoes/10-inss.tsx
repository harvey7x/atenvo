/* Lição 10 — Documentos do Meu INSS. O passo a passo completo da primeira parada
   da documentação: o que é o Meu INSS e o gov.br (a senha é a mesma), os três
   documentos (carta de concessão, extrato de empréstimo consignado e extrato de
   pagamento / Histórico de Créditos), o que cada um mostra, o caminho no
   aplicativo tela por tela, a regra dos períodos a fundo (com exemplos e erros
   comuns), o cuidado com a senha do cliente, como guiar quem faz sozinho, como
   conferir o PDF e o checklist final.
   Correção do dono (13/10): o processo revisa os juros do EMPRÉSTIMO PESSOAL, não
   do consignado. Os extratos do Meu INSS mostram o consignado e só "fazem parte da
   documentação do processo": nunca dizer que é neles que aparece o abuso.
   Fatos da empresa: só os do brief (áudio do dono de 13/10 + processo oficial do
   robô). Mensagens do robô copiadas literalmente; as do atendente são sugestões
   de roteiro. Ilustrações próprias em 10-inss-figuras.tsx. */
import type { Licao } from '../tipos';
import {
  Aviso, BomRuim, Celular, Conversa, Fatos, Frase, LinhaTempo, Lista, Passos, Sanfona, Secao, TesteRapido,
} from '../pecas';
import { CalculadoraPeriodos, PrintMeuInss } from '../ilustracoes';
import {
  CaminhoDoCliente, ChecklistMeuInss, ConfiraOPdf, ConsignadoOuPessoal, DocCarta, DocConsignado, DocHiscre, EncaixeDosAnos,
  JanelaDozeMeses, PassoAPassoApp, TabelaExemplosPeriodos, TabelaResponsiva, UmaSenhaVariasPortas, VidaDaSenha,
} from './10-inss-figuras';
import './10-inss.css';

const corpo = (
  <>
    <p className="mv-lead">
      O cliente topou seguir? Ótimo: agora começa a <b>documentação</b>, e a primeira parada sugerida é o <b>Meu INSS</b>. De lá
      saem três documentos que fazem parte da documentação do processo: a <b>carta de concessão</b>, o <b>extrato de
      empréstimo consignado</b> e o <b>extrato de pagamento de benefício dos últimos 10 anos</b>. A maioria dos clientes
      não sabe entrar no aplicativo, e é aí que você entra: guiando o cliente passo a passo ou, quando ele prefere,
      entrando com a senha que ele passou, com total segurança. Nesta lição você vai entender o que é cada documento e
      o que ele mostra, ver o caminho no aplicativo tela por tela, dominar a regra dos períodos (é onde mais
      se erra), cuidar da senha do cliente, conferir cada PDF e fechar tudo com um checklist.
    </p>

    <Fatos itens={[
      { grande: '3 documentos', texto: 'Carta de concessão, extrato de empréstimo consignado e extrato de pagamento de benefício.' },
      { grande: '1 senha', texto: 'O Meu INSS entra com a conta gov.br. A senha do Meu INSS é a senha do gov.br.' },
      { grande: '10 anos', texto: 'O extrato de pagamento entra na documentação do processo cobrindo os últimos 10 anos.' },
      { grande: '12 meses', texto: 'O máximo que o extrato de pagamento entrega por consulta. Resultado: 10 arquivos, um por ano.' },
    ]} />

    {/* ------------------------------------------------------------------ 1. Meu INSS e gov.br */}
    <Secao titulo="1. Meu INSS e gov.br: a porta e a chave">
      <p>
        O <b>Meu INSS</b> é o canal oficial do INSS na internet. Funciona como aplicativo de celular (Android e iPhone) e
        como site (meu.inss.gov.br). Ali, quem recebe um benefício consulta tudo sobre ele: quanto recebe, o que o INSS
        desconta, os empréstimos consignados, os pedidos feitos ao INSS. E baixa documentos oficiais em PDF. É de lá que saem os
        três documentos desta lição.
      </p>
      <p>
        O <b>gov.br</b> é a conta única do governo federal: um só cadastro, com o CPF e uma senha, para entrar em vários
        serviços públicos. O Meu INSS não tem senha própria. Na hora de entrar, ele manda a pessoa para o gov.br. Por
        isso, guarde esta ideia: <b>a senha do Meu INSS é a senha do gov.br</b>. É a mesma chave que, nas próximas
        lições, abre o Meu Imposto de Renda e permite assinar as procurações.
      </p>
      <UmaSenhaVariasPortas />
      <p>
        Na prática, isso desfaz uma confusão muito comum. Quando o cliente diz “não tenho senha do INSS”, muitas vezes ele
        tem, sim, uma conta gov.br, que já usou para outra coisa do governo. Em vez de perguntar pela “senha do INSS”,
        pergunte: <i>“O senhor já entrou em algum serviço do governo com o CPF e uma senha?”</i>. E, no canal de
        empréstimo, leia a conversa antes: a IA já perguntou se a pessoa tem a senha do gov.br ou usa o Meu INSS, e a
        resposta está lá.
      </p>
      <Sanfona itens={[
        {
          titulo: '“Não tenho senha do INSS.”',
          corpo: <p>Pergunte pela senha do gov.br: é a mesma. Se ele nunca criou a conta, ela é criada no próprio gov.br,
            com o CPF. Se ele esqueceu a senha, a tela de entrada tem a opção “Esqueci minha senha”. Vá com calma, uma
            etapa por vez, e fale com o seu gestor se travar.</p>,
        },
        {
          titulo: '“Isso é seguro? É do governo mesmo?”',
          corpo: <p>Sim. O Meu INSS e o gov.br são os canais oficiais do governo. Deixe claro que a CAF não é o INSS: a
            gente só ajuda o cliente a baixar documentos que são dele. Oriente a usar o aplicativo oficial, baixado na loja
            de aplicativos do próprio celular, ou o site cujo endereço termina em <b>gov.br</b>. Nunca mande o cliente
            entrar por um link de terceiros: é assim que agem os golpes que imitam o INSS.</p>,
        },
        {
          titulo: '“Pelo celular ou pelo computador?”',
          corpo: <p>Os dois funcionam. O cliente quase sempre usa o aplicativo no celular; o site meu.inss.gov.br tem os
            mesmos serviços, com os mesmos nomes. A aparência muda de um para o outro (e muda com as atualizações), mas o
            caminho é igual: entrar, buscar, baixar.</p>,
        },
        {
          titulo: '“O cliente tem dois benefícios.”',
          corpo: <p>Pode acontecer, por exemplo, aposentadoria e pensão. O aplicativo pode pedir para escolher o benefício
            antes de mostrar os documentos. Anote os dois números de benefício e pergunte ao seu gestor quais documentos
            pegar de cada um.</p>,
        },
        {
          titulo: '“Apareceu um pedido de código ou de confirmação.”',
          corpo: <p>O gov.br às vezes pede uma confirmação a mais, como um código enviado ao celular do dono da conta. Se é
            o próprio cliente entrando, ele recebe e confirma no celular dele. Se é você entrando com a senha que ele
            passou, pare e fale com o seu gestor antes de pedir qualquer coisa ao cliente.</p>,
        },
      ]} />
    </Secao>

    {/* ------------------------------------------------------------------ 2. os três documentos */}
    <Secao titulo="2. Os três documentos e o que cada um mostra">
      <p>
        Pense nos três documentos como três capítulos da história do benefício. A <b>carta de concessão</b> conta
        <b> quem</b> recebe e <b>que benefício</b> é. O <b>extrato de consignado</b> conta quais <b>consignados</b> existem
        (os empréstimos e os cartões que o INSS desconta direto do benefício), em quais bancos, e quanto sobra de margem. O
        <b> extrato de pagamento</b> conta, <b>mês a mês</b>, quanto o benefício pagou e quanto o INSS descontou. Os três
        fazem parte da documentação do processo. Veja o resumo e, depois, cada um em detalhe.
      </p>
      <TabelaResponsiva
        corte="largo"
        colunas={['Documento', 'Nome no aplicativo', 'O que mostra', 'No nosso trabalho', 'Arquivos']}
        destaque={0}
        linhas={[
          ['Carta de concessão', 'Carta de Concessão', 'Quem recebe, número e tipo do benefício, desde quando', 'Documentação do processo; mostra qual é o benefício', '1'],
          ['Extrato de consignado', 'Extrato de Empréstimo Consignado (ou Histórico de Empréstimo Consignado)', 'Consignados: contratos, bancos, parcelas, cartões e margem', 'Documentação do processo; no canal de empréstimo, mostra a margem', '1'],
          ['Extrato de pagamento', 'Extrato de Pagamento de Benefício (ou Histórico de Créditos)', 'Mês a mês: valor do benefício, cada desconto do INSS e o líquido', 'Documentação do processo: os últimos 10 anos, um arquivo por ano', '10'],
        ]}
      />

      <h4 className="mv-ins-h4">Antes de abrir os extratos: consignado não é empréstimo pessoal</h4>
      <p>
        Um cuidado que evita uma confusão séria. O processo da CAF é sobre os juros dos <b>empréstimos pessoais</b> que o
        aposentado ou pensionista fez com as financeiras (Agibank, BMG, Facta, Mercantil e Crefisa): o nosso advogado, o
        Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos nesses
        empréstimos pessoais. Já os extratos do Meu INSS mostram outra coisa: o <b>consignado</b>, que o INSS desconta
        direto do benefício. <b>O consignado é descontado pelo INSS; o empréstimo pessoal é cobrado pela financeira, fora
        do INSS</b>, e não aparece como desconto do INSS. Então, quando aparecerem bancos nos extratos, lembre: são
        consignados, e não o que a gente revisa. Os documentos do Meu INSS fazem parte da documentação do processo.
      </p>
      <ConsignadoOuPessoal />
      <Aviso tom="ambar" titulo="Rota do familiar: os documentos são do familiar que recebe">
        Quando a análise segue pelo benefício de um familiar (a rota do familiar, lição 4), os três documentos do Meu INSS
        são <b>do familiar que recebe o benefício</b>: a carta de concessão, o extrato de consignado e os 10 extratos de
        pagamento saem da conta dele, entrando com o CPF e a senha do gov.br dele. O mesmo vale para o resto da
        documentação (imposto de renda, CPF, identidade, foto do rosto, comprovante e e-mail). Na dúvida, pergunte ao seu
        gestor.
      </Aviso>

      <h4 className="mv-ins-h4">A carta de concessão</h4>
      <div className="vidro mv-ins-doc" data-tom="azul">
        <div className="mv-ins-doc-cab"><b>Carta de concessão</b><span className="mv-ins-nome-app">Carta de Concessão</span></div>
        <div className="mv-ins-doc-grade">
          <div><small>O que é</small>A carta que o INSS emite quando aprova (concede) o benefício. É a “certidão de nascimento” do benefício.</div>
          <div><small>O que mostra</small>Nome do titular, número do benefício (NB), espécie (o tipo), data de início e valor inicial.</div>
          <div><small>No nosso trabalho</small>Faz parte da documentação do processo. Mostra que o cliente recebe um benefício do INSS, qual é e desde quando ele é pago.</div>
        </div>
      </div>
      <p>
        Repare em dois campos. O <b>número do benefício</b> funciona como a identidade do benefício: ele aparece também nos
        dois extratos, e é com ele que você confere se os três documentos são do mesmo benefício. E a <b>data de
        início</b> tem um uso prático na regra dos períodos: antes dela não existe pagamento, então não existe extrato.
      </p>
      <DocCarta />

      <h4 className="mv-ins-h4">O extrato de empréstimo consignado</h4>
      <div className="vidro mv-ins-doc" data-tom="ambar">
        <div className="mv-ins-doc-cab"><b>Extrato de consignado</b><span className="mv-ins-nome-app">Extrato de Empréstimo Consignado</span></div>
        <div className="mv-ins-doc-grade">
          <div><small>O que é</small>A lista de tudo o que está “consignado” no benefício: cada empréstimo consignado e cada cartão consignado que o INSS desconta.</div>
          <div><small>O que mostra</small>Banco de cada contrato, início do desconto, número de parcelas, valor da parcela, cartões (RMC e RCC) e a margem.</div>
          <div><small>No nosso trabalho</small>Faz parte da documentação do processo. No canal de empréstimo, é onde se vê se o cliente tem margem.</div>
        </div>
      </div>
      <p>
        Ele mostra os <b>consignados</b> do benefício, cada um com o banco, as parcelas e o valor. E mostra a <b>margem</b>:
        quanto do benefício ainda pode ir para parcelas novas de consignado. É aí que ele ajuda no canal de empréstimo:
        quando o cliente que veio pelo anúncio de empréstimo está “sem margem”, é aqui que isso aparece escrito, margem
        disponível zerada. Daí vêm os ganchos, a possibilidade de aumento de margem e a de portabilidade dos consignados
        (lições 3 e 7). No aplicativo, ele também pode aparecer com o nome <b>Histórico de Empréstimo Consignado</b>.
      </p>
      <p>
        <b>Atenção a uma confusão comum.</b> Ver o nome de uma das 5 financeiras neste extrato não quer dizer que você achou
        o empréstimo pessoal do cliente. Tudo o que está aqui é consignado, descontado pelo INSS (o BMG, por exemplo,
        também tem consignado e cartão consignado). Se o cliente tem empréstimo pessoal com alguma das 5 financeiras, você
        descobre conversando com ele (lições 3 e 4).
      </p>
      <DocConsignado />
      <TesteRapido
        pergunta="O extrato de consignado da Dona Lúcia (exemplo) mostra um contrato com o BMG. O que esse contrato é?"
        opcoes={['O empréstimo pessoal que a CAF revisa', 'Um consignado, que o INSS desconta', 'A prova de juros abusivos do caso']}
        certa={1}
        explica="O extrato de consignado mostra os consignados, descontados pelo INSS direto do benefício. O processo da CAF olha os juros do empréstimo pessoal, cobrado pela financeira fora do INSS: se a cliente tem um com alguma das 5 financeiras, você descobre conversando com ela."
      />

      <h4 className="mv-ins-h4">O extrato de pagamento de benefício (Histórico de Créditos)</h4>
      <div className="vidro mv-ins-doc" data-tom="verde">
        <div className="mv-ins-doc-cab"><b>Extrato de pagamento</b><span className="mv-ins-nome-app">Histórico de Créditos</span></div>
        <div className="mv-ins-doc-grade">
          <div><small>O que é</small>O “contracheque” do benefício, mês a mês. No aplicativo: Extrato de Pagamento de Benefício ou Histórico de Créditos (HISCRE).</div>
          <div><small>O que mostra</small>Para cada mês (a competência): o valor do benefício, cada desconto do INSS com o nome do banco e o valor líquido.</div>
          <div><small>No nosso trabalho</small>Faz parte da documentação do processo, cobrindo os últimos 10 anos: um arquivo por ano.</div>
        </div>
      </div>
      <p>
        Este é o documento mais trabalhoso. A documentação do processo pede o extrato de pagamento dos <b>últimos 10
        anos</b>. <b>Por que ano a ano?</b> Porque o Histórico de Créditos só entrega <b>12 meses por consulta</b>. Para
        cobrir 10 anos, são 10 consultas e 10 arquivos. É daí que vem a regra dos períodos, na seção 4. Os descontos de
        empréstimo e de cartão que aparecem nele são consignados; o empréstimo pessoal não aparece como desconto do INSS.
      </p>
      <DocHiscre />
      <Aviso titulo="Pegar é uma coisa, ler é outra">
        Na lição 3 (“Consignado × empréstimo pessoal”) você aprendeu a <b>ler</b> o extrato de pagamento, linha por linha.
        Aqui o foco é <b>pegar</b> o documento certo, no período certo, e conferir se ele veio completo.
      </Aviso>
      <TesteRapido
        pergunta="Você quer ver, mês a mês, quanto foi descontado do benefício da Dona Lúcia em 2019. Qual documento você pede?"
        opcoes={['Extrato de Empréstimo Consignado', 'Histórico de Créditos', 'Carta de concessão']}
        certa={1}
        explica="O Histórico de Créditos é o extrato de pagamento: mostra cada mês, com o valor do benefício, cada desconto e o líquido. O extrato de consignado mostra os contratos, e a carta mostra o benefício."
      />
    </Secao>

    {/* ------------------------------------------------------------------ 3. caminho no app */}
    <Secao titulo="3. O caminho no aplicativo, tela por tela">
      <p>
        O caminho é sempre o mesmo, para qualquer um dos três documentos: <b>abrir o aplicativo, entrar com o gov.br,
        usar a busca, baixar o PDF e mandar no WhatsApp</b>. Só o extrato de pagamento tem um passo a mais: preencher o
        período. Escolha o documento e avance pelas telas. Em cada passo você vê o que fazer e onde o cliente costuma
        travar.
      </p>
      <PassoAPassoApp />
      <p>
        Os menus do aplicativo mudam de lugar com as atualizações. Por isso, a busca <b>“Do que você precisa?”</b> é o
        atalho mais seguro: em vez de procurar, você escreve. Use estes nomes:
      </p>
      <TabelaResponsiva
        corte="largo"
        colunas={['Documento', 'Escreva na busca', 'Toque em', 'Também pode aparecer como']}
        destaque={2}
        linhas={[
          ['Carta de concessão', 'carta de concessão', 'Carta de Concessão', '—'],
          ['Extrato de consignado', 'extrato de empréstimo', 'Extrato de Empréstimo Consignado', 'Histórico de Empréstimo Consignado'],
          ['Extrato de pagamento', 'extrato de pagamento', 'Extrato de Pagamento de Benefício', 'Histórico de Créditos'],
        ]}
      />
      <PrintMeuInss />
      <Aviso tom="ambar" titulo="Cuidado com os dois extratos">
        Existem dois “extratos”, e eles são documentos diferentes. O de <b>empréstimo</b> mostra os contratos consignados;
        o de <b>pagamento</b> mostra os meses. Pedir um no lugar do outro é um dos erros mais comuns. Antes de seguir, confira
        o título no topo do PDF.
      </Aviso>
    </Secao>

    {/* ------------------------------------------------------------------ 4. regra dos períodos */}
    <Secao titulo="4. A regra dos períodos, explicada a fundo">
      <p>
        Esta é a parte que mais gera erro, então vamos com calma. <b>O objetivo:</b> ter o extrato de pagamento dos
        últimos 10 anos, sem buraco e sem repetição. <b>O limite:</b> o aplicativo entrega 12 meses por vez. <b>A
        solução:</b> 10 consultas de 12 meses, encaixadas uma atrás da outra, como tijolos. Cada consulta pede duas datas
        no formato mês/ano (por exemplo, 11/2025): o início e o fim do período.
      </p>
      <div className="mv-regra">
        <div className="vidro"><small>Início do período</small><b>Mês seguinte ao atual</b><span>do ano passado</span></div>
        <div className="vidro"><small>Fim do período</small><b>Mês atual</b><span>do ano atual</span></div>
      </div>
      <p>
        <b>Por que assim?</b> Do mês seguinte do ano passado até o mês atual deste ano são exatamente 12 meses, e o
        último deles é o mês de hoje. Assim, o primeiro arquivo já pega o pagamento mais recente e cabe certinho no
        limite do aplicativo. Em outubro de 2026, por exemplo: início <b>11/2025</b>, fim <b>10/2026</b>. Conte: novembro
        e dezembro de 2025 (2 meses) mais janeiro a outubro de 2026 (10 meses) dão 12. Experimente com outros meses:
      </p>
      <JanelaDozeMeses />
      <p>
        <b>E dezembro?</b> Em dezembro o “ano passado” parece não bater: o início é janeiro do <b>mesmo</b> ano (em
        dezembro de 2026, o período é 01/2026 a 12/2026). Não é uma exceção: contando 12 meses para trás a partir de
        dezembro, você chega em janeiro do mesmo ano. Se um dia a regra confundir, pense assim: <b>o fim é o mês de hoje,
        e o início é 11 meses antes dele</b>. Funciona para qualquer mês.
      </p>

      <h4 className="mv-ins-h4">Depois do primeiro: descendo um ano por vez</h4>
      <p>
        Com o primeiro período pronto, os outros nove são fáceis: <b>mantenha os mesmos meses e diminua 1 no ano</b>, nas
        duas datas. Em outubro de 2026: 11/2025 a 10/2026, depois 11/2024 a 10/2025, depois 11/2023 a 10/2024, e assim
        até o décimo, 11/2016 a 10/2017. Repare que o fim de um período (10/2025) é sempre o mês anterior ao início do
        período mais novo (11/2025). É isso que garante que nenhum mês fique de fora e nenhum se repita. Veja a regra
        aplicada em quatro meses diferentes (o ano 1 é o mais recente; o ano 10, o mais antigo):
      </p>
      <TabelaExemplosPeriodos />
      <p className="mv-ins-obs">
        Os meses do início e do fim nunca mudam ao longo dos 10 períodos; só o ano desce. Se o mês mudar no meio da lista,
        alguma coisa está errada.
      </p>
      <TesteRapido
        pergunta="Estamos em junho de 2027. Qual é o primeiro período (o ano 1) do extrato de pagamento?"
        opcoes={['07/2026 a 06/2027', '06/2026 a 06/2027', '01/2027 a 06/2027']}
        certa={0}
        explica="Início = mês seguinte (julho) do ano passado (2026); fim = mês atual (junho) do ano atual (2027). São 12 meses. 06/2026 a 06/2027 daria 13 meses, e 01/2027 a 06/2027, só 6."
      />

      <h4 className="mv-ins-h4">Os erros mais comuns (e o estrago de cada um)</h4>
      <p>
        Quase todo erro de período cai em um destes três tipos: repetir um ano, pular um ano ou começar no mês atual.
        Escolha cada um abaixo e veja, na faixa de baixo, o buraco ou a repetição que ele deixa nos 10 anos.
      </p>
      <EncaixeDosAnos />
      <TabelaResponsiva
        colunas={['Erro', 'Como fica (em out/2026)', 'O problema', 'Como evitar']}
        linhas={[
          ['Repetir o mesmo ano', '11/2024 a 10/2025 baixado duas vezes', 'São 10 arquivos, mas só 9 anos: o mais antigo fica de fora', 'Marcar cada período na calculadora assim que o PDF chegar'],
          ['Pular um ano', 'De 11/2024 a 10/2025 direto para 11/2022 a 10/2023', 'Um ano inteiro sem extrato no meio da história', 'Descer só 1 no ano de cada vez; conferir os 10 da lista'],
          ['Pôr o mês atual no início', '10/2025 a 10/2026', '13 meses: passa do limite de 12, e o mês se repete em todos os anos', 'Início é sempre o mês seguinte (o fim menos 11 meses)'],
          ['Inverter as datas', 'Início 10/2026 e fim 11/2025', 'O período fica de trás para a frente', 'Início é a data mais antiga; fim, a mais recente'],
        ]}
      />
      <TesteRapido
        pergunta="Estamos em dezembro de 2026. Um colega baixou 01/2026 a 12/2026 e, logo depois, 01/2024 a 12/2024. O que aconteceu?"
        opcoes={['Está certo: em dezembro a regra é diferente', 'Pulou um ano: faltou 01/2025 a 12/2025', 'Repetiu o mesmo ano']}
        certa={1}
        explica="O primeiro período está certo, mas o segundo tinha que ser 01/2025 a 12/2025 (só 1 a menos no ano). Indo direto para 2024, um ano inteiro ficou sem extrato."
      />

      <h4 className="mv-ins-h4">No dia a dia: use a calculadora</h4>
      <p>
        Você não precisa fazer a conta de cabeça. A calculadora abaixo já vem com o mês de hoje. Clique em um período
        para ver como ele fica na tela do aplicativo, use “Copiar” para mandar as datas ao cliente e marque cada ano
        conforme o PDF chegar. A mesma calculadora fica na Consulta rápida do manual.
      </p>
      <CalculadoraPeriodos />
      <Aviso tom="ambar" titulo="E se o benefício tem menos de 10 anos?">
        Olhe a <b>data de início</b> na carta de concessão. Se o benefício começou, por exemplo, em 2020, os períodos
        anteriores não vão ter pagamentos para mostrar. Não invente período: anote a data de início e combine com o seu
        gestor como registrar os anos sem extrato.
      </Aviso>
    </Secao>

    {/* ------------------------------------------------------------------ 5. caminho de cada cliente */}
    <Secao titulo="5. Cada cliente, um caminho">
      <p>
        Antes de mandar o primeiro passo, descubra com quem você está lidando. Tem cliente que mexe bem no celular, tem
        quem tem a senha e não sabe usar, quem esqueceu a senha, quem nunca criou a conta gov.br e quem depende de um
        filho ou neto. Cada um pede um jeito de conduzir. Responda a árvore abaixo como se fosse um cliente seu:
      </p>
      <CaminhoDoCliente />
      <p>
        Repare na ordem: <b>primeiro você oferece guiar</b>. Quando o próprio cliente entra, ele aprende, sente que está
        no controle e a senha nunca sai da mão dele. A senha só entra na conversa quando ele não consegue ou prefere
        passar. As duas próximas seções mostram como fazer bem cada caminho.
      </p>
    </Secao>

    {/* ------------------------------------------------------------------ 6. cliente faz sozinho */}
    <Secao titulo="6. Quando o cliente faz sozinho (e você guia)">
      <p>
        Guiar à distância, só por mensagem e áudio, é uma habilidade. O cliente não está vendo o que você imagina, e
        muitas vezes tem pouca prática com aplicativo, senha e PDF. Estas regras evitam quase todos os tropeços:
      </p>
      <Lista itens={[
        <><b>Um passo por mensagem.</b> Mande o próximo só quando ele disser que deu certo.</>,
        <><b>Use os nomes exatos</b> que aparecem na tela, entre aspas: “Entrar com gov.br”, “Do que você precisa?”.</>,
        <><b>Travou? Peça um print</b> (uma foto da tela). Ver a tela resolve em segundos o que levaria dez mensagens.</>,
        <><b>Áudio curto</b> para quem tem dificuldade de ler; <b>texto</b> para o que ele precisa copiar, como as datas.</>,
        <><b>Comemore cada documento</b> que chega. São 12 arquivos no total (1 carta, 1 extrato de consignado e 10 de pagamento): o cliente precisa de ânimo para chegar ao fim.</>,
        <><b>Se ele cansar</b>, combine de continuar depois, no horário que for melhor para ele.</>,
      ]} />
      <p>Veja como fica uma conversa bem conduzida, do começo até o primeiro PDF:</p>
      <Celular
        contato="Dona Lúcia"
        sub="cliente · exemplo"
        legenda="Guiando a carta de concessão. Um passo por vez, com print quando trava."
        bolhas={[
          { de: 'eu', texto: 'Dona Lúcia, vamos pegar o primeiro documento? Abra o aplicativo Meu INSS e toque em “Entrar com gov.br”. Me avisa quando aparecer o lugar do CPF 😊', hora: '10:02' },
          { de: 'cliente', texto: 'apareceu', hora: '10:04' },
          { de: 'eu', texto: 'Ótimo! Digite o seu CPF e toque em “Continuar”. Depois ele pede a senha: é a mesma do gov.br.', hora: '10:04' },
          { de: 'cliente', tipo: 'imagem', legenda: 'é aqui?', hora: '10:07' },
          { de: 'eu', texto: 'Isso, a senhora já entrou! Agora toque lá em cima, onde está escrito “Do que você precisa?”, e escreva: carta de concessão', hora: '10:08' },
          { de: 'cliente', tipo: 'documento', legenda: 'carta-de-concessao.pdf', hora: '10:12' },
          { de: 'eu', texto: 'Recebi! Ficou ótimo, dá para ler tudo. Agora vamos para o próximo, com calma.', hora: '10:13' },
        ]}
      />
      <p>
        O extrato de pagamento é o trecho mais longo, porque são 10 consultas. O segredo é fazer o primeiro com o cliente,
        bem devagar, e depois mandar só as datas novas: o caminho é sempre o mesmo. Um roteiro que funciona (exemplo em
        outubro de 2026; use a calculadora para as datas de hoje):
      </p>
      <Conversa
        titulo="Guiando o extrato de pagamento"
        nota="sugestão de roteiro, adapte ao cliente"
        falas={[
          { quem: 'eu', texto: 'Agora vamos ao extrato de pagamento. Na busca “Do que você precisa?”, escreva: extrato de pagamento. Toque em “Extrato de Pagamento de Benefício” (pode aparecer como “Histórico de Créditos”).' },
          { quem: 'cliente', texto: 'achei. ta pedindo inicio e fim' },
          { quem: 'eu', texto: 'Isso! Vamos fazer um ano de cada vez. No início coloque 11/2025 e no fim coloque 10/2026. Depois baixe o PDF e me mande aqui.' },
          { quem: 'cliente', texto: 'mandei' },
          { quem: 'eu', texto: 'Perfeito, recebi! Agora é o mesmo caminho, só mudando as datas: início 11/2024 e fim 10/2025.' },
          { quem: 'eu', texto: 'Já foram 2 de 10. A senhora está indo muito bem!' },
        ]}
      />
      <Sanfona itens={[
        {
          titulo: 'Roteiro de áudio para começar (sugestão)',
          corpo: <p>“Oi, Dona Lúcia! Vou te explicar com calma, tá? Abre o aplicativo Meu INSS no seu celular, aquele do
            governo. Vai aparecer um botão escrito ‘Entrar com gov.br’. Toca nele e me avisa quando aparecer o lugar do
            CPF.” Fale devagar, um passo por áudio, e chame pelo nome.</p>,
        },
        {
          titulo: 'Roteiro de áudio para o extrato de pagamento (sugestão)',
          corpo: <p>“Agora a gente vai fazer o extrato de pagamento, um ano de cada vez. Eu vou te mandar as datas
            escritas aqui embaixo, pra senhora copiar certinho. É sempre o mesmo caminho, só mudam as datas.” Depois do
            áudio, mande as datas por <b>texto</b>: data dita em áudio é a receita do erro.</p>,
        },
        {
          titulo: 'Quando ele trava ou se assusta',
          corpo: <p>“Não tem problema nenhum, isso acontece com todo mundo. Me manda uma foto da tela do jeito que está
            agora, que eu te digo onde tocar.” Nunca demonstre pressa. Se ele cansar, combine um horário para
            continuar.</p>,
        },
        {
          titulo: 'Quando quem ajuda é um filho ou neto',
          corpo: <p>Guie quem estiver com o celular do mesmo jeito. Só lembre: o CPF, a senha e os documentos são sempre de
            quem recebe o benefício. Na rota do familiar, é o familiar que recebe.</p>,
        },
      ]} />
    </Secao>

    {/* ------------------------------------------------------------------ 7. senha */}
    <Secao titulo="7. Quando o cliente passa a senha: o procedimento">
      <p>
        Muitos clientes não conseguem entrar sozinhos, mesmo com ajuda, e preferem passar a senha do gov.br para a gente
        pegar os documentos. Isso é uma prova de confiança enorme: com essa senha dá para entrar no Meu INSS e em vários
        outros serviços do governo em nome da pessoa. Por isso, a regra é simples e não tem exceção: <b>a senha serve para buscar os documentos, e só
        isso</b>. A gente entra com total segurança e, depois, <b>ajuda o cliente a trocar a senha</b>.
      </p>
      <p>
        Lembre também do que o robô diz ao cliente no canal de juros abusivos, logo quando pede o CPF:
      </p>
      <Celular
        contato="CAF"
        sub="mensagem automática do canal de juros"
        legenda="O que o cliente já leu antes de falar com você. Essa promessa continua valendo."
        bolhas={[
          { de: 'robo', texto: 'Poderia me informar seu *CPF*?', hora: '09:44' },
          { de: 'robo', texto: '🔒 Seus dados são usados somente para a consulta. *Nunca pedimos senhas, códigos ou qualquer pagamento.*', hora: '09:44' },
        ]}
      />
      <p>
        Ou seja: você <b>não pede nem exige</b> a senha, e não pressiona. Primeiro oferece guiar o cliente para ele mesmo
        entrar. A senha só entra na conversa se ele não conseguir, ou preferir, e decidir passar. Veja o caminho
        completo, em cinco passos:
      </p>
      <VidaDaSenha />
      <Frase>A senha do cliente abre uma porta só: a dos documentos. Usou, saiu, ajudou a trocar.</Frase>
      <BomRuim
        ruim={{
          titulo: 'Nunca faça',
          corpo: <Lista tom="nao" itens={[
            '“Me passa sua senha que eu resolvo tudo.” (pressa e pressão)',
            'Anotar a senha em papel, planilha, bloco de notas ou grupo',
            'Deixar a senha salva no navegador ou a conta aberta',
            'Aproveitar o acesso para olhar ou mudar outras coisas da conta',
            'Passar a senha para alguém de fora do atendimento',
            'Esquecer de ajudar o cliente a trocar a senha',
          ]} />,
        }}
        bom={{
          titulo: 'Sempre faça',
          corpo: <Lista tom="sim" itens={[
            'Oferecer primeiro: “Quer que eu te guie passo a passo?”',
            'Explicar para que vai usar: só para buscar os documentos',
            'Entrar, baixar, conferir e sair da conta',
            'Avisar o cliente quando terminar',
            'Ajudar a criar uma senha nova, que só ele saiba',
            'Na dúvida, perguntar ao gestor antes de agir',
          ]} />,
        }}
      />
      <Conversa
        titulo="Recebendo a senha (e devolvendo a porta)"
        nota="sugestão de roteiro, adapte ao cliente"
        falas={[
          { quem: 'cliente', texto: 'minha filha que mexia nisso. posso te passar a senha pra você pegar?' },
          { quem: 'eu', texto: 'Pode sim, Dona Lúcia, obrigado(a) pela confiança! Vou usar a sua senha só para buscar os documentos do seu processo, com total segurança, e não vou guardar ela em lugar nenhum. Assim que eu terminar, te aviso aqui e a gente troca a sua senha juntos, combinado?' },
          { quem: 'cliente', texto: '(a cliente manda a senha)' },
          { quem: 'eu', texto: 'Recebi. Já vou começar e te aviso quando terminar.' },
          { quem: 'eu', texto: 'Pronto, Dona Lúcia! Já peguei os documentos. Agora, por segurança, vamos trocar a sua senha do gov.br. É rapidinho e eu te ajudo em cada passo.' },
        ]}
      />
      <h4 className="mv-ins-h4">Como ajudar a trocar a senha</h4>
      <Passos itens={[
        { titulo: 'Avise que terminou', texto: 'Conte ao cliente que já pegou os documentos e que agora, por segurança, é hora de trocar a senha.' },
        { titulo: 'Guie até a área de segurança da conta', texto: 'No aplicativo gov.br (ou no site), dentro da conta, há uma área de segurança com a opção de alterar a senha. Os nomes dos botões mudam com as atualizações: se ele não achar, peça um print da tela.' },
        { titulo: 'Senha nova, só dele', texto: 'Oriente uma senha que só ele saiba: nada de data de nascimento, nome ou sequências como 123456. Você não precisa (nem deve) saber a senha nova.' },
        { titulo: 'Confirme que deu certo', texto: 'Peça para ele confirmar que conseguiu entrar com a senha nova. Pronto: a porta voltou a ser só dele.' },
      ]} />
      <TesteRapido
        pergunta="Você terminou de baixar os extratos com a senha que a Dona Lúcia passou. O que fazer agora?"
        opcoes={['Guardar a senha numa planilha, caso precise de novo', 'Passar a senha para um colega conferir os arquivos', 'Sair da conta e ajudar a Dona Lúcia a trocar a senha']}
        certa={2}
        explica="A senha serve só para buscar os documentos. Terminou? Saia da conta e ajude o cliente a criar uma senha nova, que só ele saiba."
      />
      <p className="mv-ins-obs">
        Guarde este procedimento: ele vale sempre que o cliente passar a senha do gov.br, também na etapa do imposto de
        renda (lição 11). O cuidado com os dados do cliente vai além da senha (LGPD, golpes, prints e grupos): veja a
        lição 14, “Segurança, ética e LGPD”.
      </p>
    </Secao>

    {/* ------------------------------------------------------------------ 8. conferir o PDF */}
    <Secao titulo="8. Conferir o PDF antes de seguir">
      <p>
        Documento errado descoberto lá na frente custa caro: o cliente tem que voltar ao aplicativo, refazer o caminho e,
        às vezes, já perdeu o ânimo. Por isso, <b>confira cada PDF assim que ele chegar</b>, com o cliente ainda na
        conversa. São cinco olhadas rápidas:
      </p>
      <Passos itens={[
        { titulo: 'Título', texto: 'É o documento que você pediu? Carta, extrato de empréstimo ou extrato de pagamento. Os dois extratos são diferentes.' },
        { titulo: 'Nome e número do benefício', texto: 'É do titular do benefício que está sendo analisado? O número do benefício bate com o da carta de concessão?' },
        { titulo: 'Período', texto: 'No extrato de pagamento: o início e o fim batem com a lista da calculadora? Não repetiu, não pulou?' },
        { titulo: 'Legível', texto: 'Dá para ler tudo? O PDF baixado pelo aplicativo é sempre melhor que foto da tela, que sai torta, cortada ou borrada.' },
        { titulo: 'Completo', texto: 'Veio inteiro, com todas as páginas? O extrato de pagamento traz os 12 meses do período.' },
      ]} />
      <p>Agora treine. Para cada arquivo, decida: aprovar ou pedir de novo?</p>
      <ConfiraOPdf />
      <p>
        Precisa pedir de novo? Sem drama e sem culpar o cliente. Agradeça, diga exatamente o que mudar e mande as datas
        certas por escrito:
      </p>
      <Conversa
        titulo="Pedindo de novo, com gentileza"
        nota="sugestão de roteiro, adapte ao cliente"
        falas={[
          { quem: 'eu', texto: 'Recebi, obrigado(a)! Só um detalhe: esse arquivo ficou com o período 10/2025 a 09/2026, e eu preciso de 11/2025 a 10/2026. Pode fazer o mesmo caminho só trocando as datas? Início 11/2025 e fim 10/2026.' },
          { quem: 'cliente', texto: 'ah sim, vou fazer de novo' },
          { quem: 'eu', texto: 'Perfeito, muito obrigado(a) pela paciência! 😊' },
        ]}
      />
    </Secao>

    {/* ------------------------------------------------------------------ 9. checklist */}
    <Secao titulo="9. Checklist final do Meu INSS">
      <p>
        Antes de passar para o gov.br, confira tudo de uma vez. Se faltar qualquer item, resolva agora: é muito mais fácil
        do que voltar ao cliente depois.
      </p>
      <ChecklistMeuInss />
    </Secao>

    <Secao titulo="E depois do Meu INSS?">
      <p>
        A ordem sugerida da documentação é esta: Meu INSS, depois gov.br, depois documentos pessoais. Ela ajuda a
        organizar, mas <b>não é rígida</b>: se o cliente já tem a identidade ou o comprovante em mãos e quer mandar
        antes, receba e siga. Cada etapa tem a sua lição:
      </p>
      <LinhaTempo itens={[
        { quando: 'Agora', titulo: 'Meu INSS (esta lição)', texto: 'Carta de concessão, extrato de empréstimo consignado e os 10 extratos de pagamento.' },
        { quando: 'Lição 11', titulo: 'gov.br: imposto de renda e CPF', texto: 'Meu Imposto de Renda dos últimos 3 anos e a situação cadastral do CPF.' },
        { quando: 'Lição 12', titulo: 'Documentos pessoais', texto: 'Identidade, comprovante de residência, foto do rosto e e-mail.' },
        { quando: 'Lição 13', titulo: 'Cadastro e procurações', texto: 'Cadastro do cliente no sistema e assinatura das procurações pelo gov.br.' },
      ]} />
    </Secao>

    <Secao titulo="Resumo da lição">
      <Lista itens={[
        <>A senha do Meu INSS é a senha do <b>gov.br</b>. Cliente “sem senha do INSS” muitas vezes tem a do gov.br.</>,
        <>São <b>3 documentos</b>, todos parte da documentação do processo: carta de concessão (o benefício), extrato de empréstimo consignado (os consignados e a margem) e extrato de pagamento, o Histórico de Créditos (os descontos do INSS mês a mês).</>,
        <>Os extratos mostram o <b>consignado</b>, que o INSS desconta. O processo revisa os juros do <b>empréstimo pessoal</b>, cobrado pela financeira fora do INSS: se o cliente tem um, você descobre conversando (lição 3).</>,
        <>Caminho no app: entrar com gov.br, buscar em <b>“Do que você precisa?”</b>, baixar o PDF e mandar. No extrato de pagamento, <b>10 arquivos de 12 meses</b>: início no mês seguinte do ano passado, fim no mês atual; depois, desce 1 no ano.</>,
        <>Senha do cliente: primeiro ofereça guiar. Se ele passar, use <b>só para os documentos</b>, não guarde, saia da conta e ajude a trocar.</>,
        <>Confira cada PDF na hora: <b>título, nome, período, legível e completo</b>. Depois, o checklist e o gov.br.</>,
      ]} />
    </Secao>
  </>
);

const licao: Licao = {
  id: 'inss',
  modulo: 'documentacao',
  titulo: 'Documentos do Meu INSS',
  resumo: 'Os três documentos do Meu INSS, o caminho no aplicativo tela por tela, a regra dos períodos, a senha do cliente e como conferir cada PDF.',
  minutos: 35,
  corpo,
  questoes: [
    {
      p: 'Qual senha o cliente usa para entrar no Meu INSS?',
      o: ['Uma senha própria do Meu INSS', 'A senha da conta gov.br', 'A senha do cartão do benefício'],
      c: 1,
      e: 'O Meu INSS não tem senha própria: a entrada é pela conta gov.br. A senha do Meu INSS é a senha do gov.br.',
    },
    {
      p: 'A cliente mandou uma foto torta da tela com o extrato, difícil de ler. O que você faz?',
      o: ['Aceitar, porque o que vale é ter o documento', 'Pedir para ela digitar os dados na conversa', 'Pedir de novo o PDF baixado pelo aplicativo'],
      c: 2,
      e: 'Foto da tela sai torta, cortada ou borrada. O PDF baixado pelo aplicativo vem inteiro e nítido: peça de novo, com gentileza.',
    },
    {
      p: 'Por que o extrato de pagamento (Histórico de Créditos) é baixado em 10 arquivos, ano a ano?',
      o: ['O app entrega 12 meses por vez, e são 10 anos', 'Cada arquivo mostra os descontos de um só banco', 'O INSS só deixa baixar um arquivo por dia'],
      c: 0,
      e: 'A documentação do processo pede o extrato de pagamento dos últimos 10 anos, e o Histórico de Créditos só entrega 12 meses por consulta: 10 consultas, 10 arquivos.',
    },
    {
      p: 'Qual documento mostra os contratos que o INSS desconta, os bancos, as parcelas e a margem?',
      o: ['Extrato de Empréstimo Consignado', 'Extrato de Pagamento de Benefício', 'Carta de concessão do benefício'],
      c: 0,
      e: 'O Extrato de Empréstimo Consignado lista cada consignado e mostra a margem. O de pagamento mostra os meses; a carta, o benefício.',
    },
    {
      p: 'Em dezembro de 2026, qual é o primeiro período do extrato?',
      o: ['12/2025 a 12/2026', '01/2026 a 12/2026', '01/2025 a 12/2026'],
      c: 1,
      e: 'O fim é o mês atual (12/2026) e o início é 11 meses antes: janeiro do mesmo ano. 12/2025 a 12/2026 daria 13 meses.',
    },
  ],
  glossario: [
    { termo: 'Meu INSS', def: 'Aplicativo e site oficiais do INSS (meu.inss.gov.br). É onde quem recebe benefício consulta tudo sobre ele e baixa documentos como a carta de concessão e os extratos.' },
    { termo: 'Carta de concessão', def: 'Documento que o INSS emite quando concede o benefício. Mostra quem recebe, o número do benefício, a espécie (o tipo) e a data de início.' },
    { termo: 'Número do benefício (NB)', def: 'O número que identifica o benefício no INSS. Aparece na carta e nos extratos; quem recebe dois benefícios tem dois números.' },
    { termo: 'Extrato de Empréstimo Consignado', def: 'Documento do Meu INSS com os consignados do benefício (empréstimos e cartões que o INSS desconta direto): banco, parcelas, valor e margem. Também aparece como Histórico de Empréstimo Consignado.' },
    { termo: 'Histórico de Créditos', def: 'Nome do Extrato de Pagamento de Benefício no Meu INSS (sigla HISCRE). Mostra, mês a mês, o valor do benefício, cada desconto do INSS e o que caiu na conta. Entrega 12 meses por vez.' },
    { termo: 'Período do extrato', def: 'Os 12 meses de cada consulta do Histórico de Créditos. Início no mês seguinte ao atual, do ano passado; fim no mês atual. São 10 períodos para cobrir 10 anos.' },
    { termo: 'Competência', def: 'O mês a que um pagamento do benefício se refere. No extrato de pagamento, cada bloco é uma competência.' },
    { termo: 'PDF', def: 'Tipo de arquivo de documento que abre igual em qualquer celular ou computador. É o formato em que o Meu INSS entrega os documentos.' },
  ],
  mensagens: [
    {
      titulo: 'Começar a documentação no Meu INSS',
      quando: 'O cliente topou seguir: hora de pegar os documentos do Meu INSS.',
      texto: 'Agora vamos para a documentação, [nome do cliente]! O primeiro passo é pegar 3 documentos no aplicativo Meu INSS. Eu te ajudo em cada etapa, com calma. 😊\n\nVocê consegue entrar no Meu INSS pelo celular? A senha é a mesma do gov.br.',
    },
    {
      titulo: 'Passo a passo da carta de concessão',
      quando: 'O cliente vai baixar sozinho, com você guiando por mensagem.',
      texto: 'Vamos ao primeiro documento:\n\n1. Abra o aplicativo Meu INSS e toque em “Entrar com gov.br”\n2. Digite o seu CPF e a senha do gov.br\n3. Toque na busca “Do que você precisa?” e escreva: carta de concessão\n4. Abra o resultado e baixe o PDF\n5. Me mande o PDF aqui nesta conversa\n\nSe travar em alguma parte, me manda uma foto da tela que eu te ajudo!',
    },
    {
      titulo: 'Extrato de pagamento, um ano por vez',
      quando: 'Hora dos 10 extratos de pagamento. Troque [início] e [fim] pelas datas da calculadora de períodos.',
      texto: 'Agora o extrato de pagamento. Vamos fazer um ano de cada vez:\n\n1. Na busca “Do que você precisa?”, escreva: extrato de pagamento\n2. Toque em “Extrato de Pagamento de Benefício” (pode aparecer como “Histórico de Créditos”)\n3. No início do período coloque [início] e no fim coloque [fim]\n4. Baixe o PDF e me mande aqui\n\nDepois eu te passo as próximas datas. São 10 no total, mas é sempre o mesmo caminho!',
    },
    {
      titulo: 'Quando o cliente passa a senha',
      quando: 'O cliente não conseguiu entrar sozinho e preferiu passar a senha do gov.br.',
      texto: 'Obrigado(a) pela confiança, [nome do cliente]! Vou usar a sua senha só para buscar os documentos do seu processo, com total segurança, e não vou guardar ela em lugar nenhum.\n\nAssim que eu terminar, te aviso aqui e a gente troca a sua senha juntos, combinado?',
    },
    {
      titulo: 'Trocar a senha depois',
      quando: 'Você terminou de usar a senha do cliente para buscar os documentos.',
      texto: 'Pronto, [nome do cliente]! Já peguei os documentos. 😊\n\nAgora, por segurança, vamos trocar a sua senha do gov.br. É rapidinho: abra o aplicativo gov.br (ou o site), entre na sua conta e procure a parte de segurança, onde tem a opção de alterar a senha. Escolha uma senha nova que só você saiba, sem data de nascimento e sem sequências como 123456.\n\nSe preferir, me chama que eu vou te explicando passo a passo.',
    },
  ],
};
export default licao;
