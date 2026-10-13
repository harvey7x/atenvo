/* ============================================================================
   Conteúdo do Manual de vendas — fonte: o dono (áudio de 13/10/2026).
   Texto de treinamento: mudou a regra do negócio? Mude AQUI.
   ============================================================================ */
import type { ReactNode } from 'react';
import { Aviso, Conversa, Fatos, Lista, Passos, Sanfona, Secao, TesteRapido } from './pecas';
import {
  AtendeOuDescarta, CalculadoraHonorarios, CalculadoraPeriodos, Jornada, MapaMental,
  NiveisGov, PrintMeuInss, PrintMeuIR,
} from './ilustracoes';

export type Licao = { id: string; titulo: string; resumo: string; minutos: number; corpo: ReactNode };

export const LICOES: Licao[] = [
  {
    id: 'empresa',
    titulo: 'O que a gente faz',
    resumo: 'A Central e o nosso carro-chefe: o ressarcimento de juros abusivos.',
    minutos: 4,
    corpo: (
      <>
        <p className="mv-lead">
          Somos a <b>Central de Assessoria Financeira</b>. Hoje o nosso principal trabalho, o carro-chefe da empresa,
          são os <b>processos de ressarcimento de juros abusivos</b> em empréstimos de aposentados e pensionistas do INSS.
        </p>
        <Fatos itens={[
          { grande: '10 anos', texto: 'O processo pede de volta tudo o que foi descontado de forma abusiva nos últimos 10 anos.' },
          { grande: '6 a 12 meses', texto: 'É o tempo médio até o cliente receber o ressarcimento.' },
          { grande: 'R$ 0', texto: 'O cliente não paga nada para começar. O processo é gratuito.' },
          { grande: '30%', texto: 'Honorários do advogado, só no final, tirados do que o cliente receber.' },
        ]} />
        <Secao titulo="Como funciona, em uma frase">
          <p>
            O cliente nos procura querendo revisar os juros dos empréstimos. Nós juntamos a documentação e o nosso advogado,
            o <b>Dr. Rafael Menezes</b>, entra com uma ação pedindo o ressarcimento de tudo o que foi descontado nos últimos 10 anos.
          </p>
        </Secao>
        <Secao titulo="A jornada completa do cliente">
          <Jornada />
        </Secao>
        <Secao titulo="Os 30% na prática">
          <p>O valor dos honorários é fixo: <b>30% do que o cliente ganhar</b>, e só no final. Use a calculadora para explicar com números.</p>
          <CalculadoraHonorarios />
        </Secao>
        <TesteRapido
          pergunta="Um cliente pergunta quanto precisa pagar para entrar com o processo. O que você responde?"
          opcoes={['R$ 300 de entrada e o resto no final', 'Nada para começar; 30% do que ele receber, no final', '30% do valor do empréstimo, parcelado']}
          certa={1}
          explica="O processo é gratuito para começar. Os honorários de 30% saem do valor que o cliente receber, no final do processo."
        />
      </>
    ),
  },
  {
    id: 'cliente',
    titulo: 'Quem é o nosso cliente',
    resumo: 'Aposentados e pensionistas do INSS. CLT a gente descarta.',
    minutos: 4,
    corpo: (
      <>
        <p className="mv-lead">
          O nosso anúncio fala diretamente com <b>aposentados e pensionistas do INSS</b>. É só com eles que a gente consegue trabalhar.
          Por isso, a <b>primeira coisa</b> a confirmar em qualquer atendimento é o perfil.
        </p>
        <div className="mv-duas">
          <div className="vidro mv-cartao" data-tom="verde">
            <h4>Atendemos</h4>
            <Lista tom="sim" itens={['Aposentado do INSS', 'Pensionista do INSS', 'Com empréstimo consignado nas financeiras abaixo']} />
          </div>
          <div className="vidro mv-cartao" data-tom="rubro">
            <h4>Descartamos</h4>
            <Lista tom="nao" itens={['CLT (carteira assinada)', 'Quem não recebe aposentadoria nem pensão do INSS', 'Qualquer perfil fora do INSS']} />
          </div>
        </div>
        <Secao titulo="As financeiras">
          <p>São as financeiras com quem os nossos clientes mais têm empréstimo. As <b>três primeiras</b> são as que mais chegam até a gente.</p>
          <div className="mv-bancos">
            {['Agibank', 'Mercantil', 'BMG'].map((b, i) => (
              <div key={b} className="vidro mv-banco" data-top=""><span className="num">#{i + 1}</span><b>{b}</b><small>Top 3</small></div>
            ))}
            {['Facta', 'Crefisa'].map((b) => (
              <div key={b} className="vidro mv-banco"><span>·</span><b>{b}</b><small>Também trabalhamos</small></div>
            ))}
          </div>
        </Secao>
        <Aviso tom="ambar" titulo="Descartar com educação">
          Quando o perfil não serve, seja gentil e direto: agradeça o contato, explique que o nosso serviço é só para
          aposentados e pensionistas do INSS e encerre. Não deixe a pessoa esperando.
        </Aviso>
        <Secao titulo="Treino: atende ou descarta?">
          <AtendeOuDescarta />
        </Secao>
      </>
    ),
  },
  {
    id: 'canais',
    titulo: 'Os dois canais de entrada',
    resumo: 'Juros abusivos (venda direta) e empréstimo (venda consultiva).',
    minutos: 4,
    corpo: (
      <>
        <p className="mv-lead">
          Hoje temos <b>dois tráfegos pagos</b> no Facebook. O cliente chega com uma intenção diferente em cada um, e a conversa muda.
        </p>
        <div className="mv-duas">
          <div className="vidro mv-cartao mv-canal" data-tom="azul">
            <small>Canal 1 · tráfego do Andrius</small>
            <h4>Juros abusivos</h4>
            <p>O cliente <b>já quer a revisão</b>. É um público mais nichado: ele viu o anúncio do ressarcimento e veio por isso.</p>
            <div className="mv-canal-pe"><span>Venda</span><b>Direta</b></div>
            <Lista itens={['Confirmar o perfil', 'Explicar o processo e os 30%', 'Partir para os documentos']} />
          </div>
          <div className="vidro mv-canal mv-cartao" data-tom="ambar">
            <small>Canal 2</small>
            <h4>Empréstimo</h4>
            <p>O cliente <b>quer dinheiro rápido</b>. Mas a maioria <b>não tem margem</b> disponível para um empréstimo novo.</p>
            <div className="mv-canal-pe"><span>Venda</span><b>Convencer</b></div>
            <Lista itens={['Mostrar que não há margem', 'Usar os ganchos (margem, portabilidade)', 'Oferecer o processo']} />
          </div>
        </div>
        <Aviso titulo="Por que isso importa">
          No canal de empréstimo o cliente não pediu o processo. Se você começar falando de juros abusivos sem entender o que ele quer,
          ele some. Primeiro escute, depois mostre o caminho.
        </Aviso>
        <TesteRapido
          pergunta="Um cliente do canal de empréstimo não tem margem. Qual é o próximo passo?"
          opcoes={['Encerrar: sem margem não tem negócio', 'Oferecer o processo e os ganchos (aumento de margem, portabilidade)', 'Pedir que ele volte daqui a 6 meses']}
          certa={1}
          explica="Sem margem é justamente o momento de oferecer o processo, usando os ganchos de aumento de margem e portabilidade."
        />
      </>
    ),
  },
  {
    id: 'conversao',
    titulo: 'Como converter o cliente',
    resumo: 'O mapa da venda, os ganchos, os roteiros e as respostas às objeções.',
    minutos: 10,
    corpo: (
      <>
        <p className="mv-lead">
          Converter é levar o cliente da dúvida até o <b>“vamos fazer”</b>. Este é o mapa da venda inteira. Volte nele sempre que se perder numa conversa.
        </p>
        <MapaMental />
        <Secao titulo="Os ganchos (canal de empréstimo)">
          <p>Quando o cliente só quer dinheiro, estes são os caminhos que a gente apresenta. Fale sempre em <b>possibilidade</b>: cada caso é analisado.</p>
          <div className="mv-ganchos">
            <div className="vidro mv-gancho"><span className="num">1</span><b>Aumento de margem</b><p>Ver a possibilidade de aumentar a margem do cliente para ele voltar a ter crédito.</p></div>
            <div className="vidro mv-gancho"><span className="num">2</span><b>Portabilidade</b><p>Levar os consignados para outro banco, com a possibilidade de liberar um valor <b>acima de R$ 1.500</b>.</p></div>
            <div className="vidro mv-gancho"><span className="num">3</span><b>O processo</b><p>Pedir de volta o que foi descontado de forma abusiva nos últimos 10 anos, sem custo para começar.</p></div>
          </div>
        </Secao>
        <Secao titulo="Roteiro · canal de juros abusivos">
          <Conversa titulo="Venda direta" nota="Sugestão de roteiro. Adapte ao jeito do cliente." falas={[
            { quem: 'cliente', texto: 'Oi, vi o anúncio sobre juros abusivos. Queria saber como funciona.' },
            { quem: 'eu', texto: 'Olá! Aqui é da Central de Assessoria Financeira, tudo bem? Que bom que você chamou. Antes de tudo: você é aposentado(a) ou pensionista do INSS?' },
            { quem: 'cliente', texto: 'Sou aposentada.' },
            { quem: 'eu', texto: 'Perfeito. E com qual banco é o seu empréstimo? Agibank, BMG, Mercantil, Facta, Crefisa…?' },
            { quem: 'cliente', texto: 'BMG e Agibank.' },
            { quem: 'eu', texto: 'Ótimo, são bancos com que a gente trabalha muito. Funciona assim: o nosso advogado, o Dr. Rafael Menezes, entra com um processo pedindo de volta tudo o que foi descontado de forma abusiva nos últimos 10 anos. Leva em média de 6 a 12 meses.' },
            { quem: 'eu', texto: 'E você não paga nada para começar. Só no final, 30% do valor que você receber ficam para o advogado, como honorários.' },
            { quem: 'eu', texto: 'Para dar entrada eu preciso de alguns documentos do Meu INSS. Você consegue entrar no aplicativo, ou prefere que eu te ajude a pegar?' },
          ]} />
        </Secao>
        <Secao titulo="Roteiro · canal de empréstimo">
          <Conversa titulo="Venda consultiva" nota="O cliente veio pelo empréstimo. Escute primeiro." falas={[
            { quem: 'cliente', texto: 'Quero fazer um empréstimo. Quanto consigo?' },
            { quem: 'eu', texto: 'Olá! Aqui é da Central de Assessoria Financeira. Vou verificar para você. Você é aposentado(a) ou pensionista do INSS?' },
            { quem: 'cliente', texto: 'Pensionista.' },
            { quem: 'eu', texto: 'Verifiquei aqui: hoje a sua margem está toda comprometida com os empréstimos que você já tem, por isso o banco não libera um novo agora.' },
            { quem: 'eu', texto: 'Mas olhando os seus contratos, tem caminhos que podem te ajudar: ver a possibilidade de aumentar a sua margem, ou fazer a portabilidade dos consignados para outro banco, que pode liberar um valor acima de R$ 1.500.' },
            { quem: 'eu', texto: 'E tem mais uma coisa: muitos desses contratos têm juros abusivos. Com o nosso advogado dá para pedir de volta o que foi descontado nos últimos 10 anos, sem você pagar nada para começar. Quer que eu te explique?' },
          ]} />
        </Secao>
        <Secao titulo="Objeções mais comuns">
          <Sanfona itens={[
            { titulo: '“Não tenho dinheiro para pagar advogado.”', corpo: <p>Você não precisa. O processo é gratuito para começar. Os honorários são 30% do valor que você receber, e só no final do processo.</p> },
            { titulo: '“Isso não é golpe?”', corpo: <p>Entendo a preocupação, é bom desconfiar. A gente nunca pede dinheiro adiantado. O processo é feito pelo nosso advogado, o Dr. Rafael Menezes, e as procurações são assinadas pelo gov.br, o sistema oficial do governo. Se quiser, envolva um filho ou alguém de confiança na conversa.</p> },
            { titulo: '“Só quero o empréstimo.”', corpo: <p>Mostre com calma que hoje não há margem e apresente os ganchos: a possibilidade de aumentar a margem e a portabilidade (que pode liberar acima de R$ 1.500). O processo entra como o caminho que pode devolver dinheiro que já foi descontado.</p> },
            { titulo: '“Demora muito.”', corpo: <p>Leva em média de 6 a 12 meses. Enquanto isso o cliente não paga nada e nada muda no benefício dele. Quanto antes começar, antes recebe.</p> },
            { titulo: '“Não sei mexer no Meu INSS.”', corpo: <p>A gente ajuda em tudo. Se ele preferir, pode passar a senha: entramos com total segurança só para pegar os documentos e, depois, ajudamos a trocar a senha.</p> },
            { titulo: '“Vou pensar” ou “vou falar com meu filho”.', corpo: <p>Respeite. Ofereça mandar um resumo por escrito para ele mostrar à família, convide o filho para a conversa e combine um horário para retomar. Não deixe a conversa morrer sem um próximo passo.</p> },
          ]} />
        </Secao>
        <Secao titulo="Regras de ouro">
          <Lista itens={[
            <>Confirme <b>sempre primeiro</b> se é aposentado ou pensionista do INSS.</>,
            <>Nunca prometa um valor de ressarcimento nem garanta resultado. Fale em média de prazo e em possibilidade.</>,
            <>Seja claro sobre os 30%: o cliente tem que entender desde o começo.</>,
            <>Responda rápido. Cliente que espera esfria.</>,
            <>Toda conversa termina com um <b>próximo passo</b> combinado.</>,
          ]} />
        </Secao>
      </>
    ),
  },
  {
    id: 'inss',
    titulo: 'Documentos do Meu INSS',
    resumo: 'Carta de concessão, extrato de consignado e extratos de pagamento de 10 anos.',
    minutos: 8,
    corpo: (
      <>
        <p className="mv-lead">
          Cliente convencido? O próximo passo é pegar a <b>documentação básica no Meu INSS</b>. Na maioria das vezes o cliente
          não sabe entrar e acaba passando a senha para a gente.
        </p>
        <Aviso tom="verde" titulo="Quando o cliente passa a senha">
          Entramos com total segurança, só para pegar os documentos. Depois, ajudamos o cliente a <b>trocar a senha</b>.
          Nunca use a senha para qualquer outra coisa.
        </Aviso>
        <Secao titulo="Os três documentos">
          <Passos itens={[
            { titulo: 'Carta de concessão', texto: 'O documento do benefício do cliente.' },
            { titulo: 'Extrato de consignado', texto: 'No Meu INSS aparece como “Extrato de Empréstimos”. Mostra os contratos ativos.' },
            { titulo: 'Extrato de pagamento de benefício, dos últimos 10 anos', texto: 'Baixado em períodos de 12 meses, um ano por vez. Aqui é onde mais se erra: veja a regra abaixo.' },
          ]} />
          <PrintMeuInss />
        </Secao>
        <Secao titulo="A regra dos períodos">
          <p>Cada consulta do extrato tem que cobrir <b>um ano inteiro</b>. Para isso:</p>
          <div className="mv-regra">
            <div className="vidro"><small>Início do período</small><b>Mês seguinte ao atual</b><span>do ano passado</span></div>
            <div className="vidro"><small>Fim do período</small><b>Mês atual</b><span>do ano atual</span></div>
          </div>
          <p>Depois, mantenha os mesmos meses e vá descendo um ano de cada vez até completar 10 anos.</p>
          <Fatos itens={[
            { grande: 'Em outubro/2026', texto: <>Início <b>11/2025</b>, fim <b>10/2026</b>. Depois 11/2024 a 10/2025, e assim por diante.</> },
            { grande: 'Em dezembro/2026', texto: <>Início <b>01/2026</b>, fim <b>12/2026</b>. Depois 01/2025 a 12/2025, e assim por diante.</> },
          ]} />
        </Secao>
        <Secao titulo="Calculadora de períodos">
          <p>Escolha o mês em que você está: a calculadora mostra os 10 períodos. Clique num período para ver como fica na tela, e marque cada um conforme for baixando.</p>
          <CalculadoraPeriodos />
        </Secao>
        <TesteRapido
          pergunta="Estamos em março de 2027. Qual é o primeiro período do extrato?"
          opcoes={['03/2026 a 03/2027', '04/2026 a 03/2027', '01/2027 a 12/2027']}
          certa={1}
          explica="Início = mês seguinte (abril) do ano passado (2026); fim = mês atual (março) do ano atual (2027). Ou seja, 04/2026 a 03/2027."
        />
      </>
    ),
  },
  {
    id: 'gov',
    titulo: 'Imposto de renda e CPF',
    resumo: 'Meu Imposto de Renda dos últimos 3 anos e a situação cadastral do CPF.',
    minutos: 5,
    corpo: (
      <>
        <p className="mv-lead">Com o Meu INSS pronto, vamos ao <b>gov.br</b> buscar o imposto de renda e, depois, a situação cadastral do CPF.</p>
        <Secao titulo="Meu Imposto de Renda">
          <Passos itens={[
            { titulo: 'Entrar no gov.br e abrir o Meu Imposto de Renda' },
            { titulo: 'Abrir cada um dos últimos 3 anos', texto: 'Em cada ano, tire um print da tela.' },
            { titulo: 'Se o cliente declara imposto de renda, baixar a DEC e o REC', texto: 'DEC é a declaração; REC é o recibo de entrega. Os dois são importantes.' },
          ]} />
          <PrintMeuIR />
        </Secao>
        <Secao titulo="Situação cadastral do CPF">
          <Passos itens={[
            { titulo: 'Abrir a consulta de situação cadastral no site da Receita Federal' },
            { titulo: 'Preencher o CPF e a data de nascimento do cliente' },
            { titulo: 'Salvar o comprovante (PDF ou print)' },
          ]} />
        </Secao>
        <TesteRapido
          pergunta="O cliente declara imposto de renda. O que você precisa pegar de cada ano?"
          opcoes={['Só um print da tela', 'A DEC e o REC (além do print)', 'Nada, imposto de renda não entra']}
          certa={1}
          explica="Quem declara precisa ter a DEC (declaração) e o REC (recibo) de cada um dos últimos 3 anos."
        />
      </>
    ),
  },
  {
    id: 'pessoais',
    titulo: 'Documentos pessoais',
    resumo: 'Identidade, comprovante de residência recente e e-mail.',
    minutos: 3,
    corpo: (
      <>
        <p className="mv-lead">Por último, a documentação básica do próprio cliente.</p>
        <Passos itens={[
          { titulo: 'Identidade', texto: 'Foto legível, frente e verso.' },
          { titulo: 'Comprovante de residência dos últimos 2 meses', texto: 'Do mês atual ou do mês passado. Comprovante atrasado não serve.' },
          { titulo: 'E-mail do cliente', texto: 'Muito importante: é usado no cadastro e no processo.' },
        ]} />
        <Aviso tom="ambar" titulo="Comprovante no nome de outra pessoa">
          Se o cliente não tem conta no nome dele, pode ser de outra pessoa (pai, mãe, filho), mas precisamos
          também da <b>identidade dessa pessoa</b> para fazer uma <b>declaração</b>.
        </Aviso>
        <TesteRapido
          pergunta="Estamos em outubro. O cliente manda uma conta de luz de julho. Serve?"
          opcoes={['Serve, qualquer conta recente', 'Não: tem que ser de outubro ou de setembro', 'Serve se estiver paga']}
          certa={1}
          explica="O comprovante tem que ser do mês atual ou do mês passado. Julho está atrasado."
        />
      </>
    ),
  },
  {
    id: 'assinatura',
    titulo: 'Cadastro, procurações e assinatura',
    resumo: 'Cadastrar no admin, gerar as procurações e assinar pelo gov.br (prata ou ouro).',
    minutos: 5,
    corpo: (
      <>
        <p className="mv-lead">Com toda a documentação em mãos, é hora de fechar.</p>
        <Passos itens={[
          { titulo: 'Cadastrar o cliente no sistema admin', texto: 'O cadastro gera as procurações do cliente.' },
          { titulo: 'Enviar as procurações para o cliente' },
          { titulo: 'O cliente assina digitalmente pelo gov.br', texto: 'A assinatura é simples. O que importa é o nível da conta: veja abaixo.' },
        ]} />
        <Secao titulo="Nível da conta gov.br">
          <p>Para assinar, a conta gov.br do cliente <b>não pode estar no bronze</b>. Tem que estar no <b>prata</b> ou no <b>ouro</b>.</p>
          <NiveisGov />
        </Secao>
        <TesteRapido
          pergunta="A conta gov.br do cliente está no bronze. O que ele faz para assinar?"
          opcoes={['Assina assim mesmo', 'Sobe para prata (conta do banco) ou ouro (reconhecimento facial)', 'Cria uma conta nova']}
          certa={1}
          explica="Bronze não assina. Para prata, o cliente valida com a conta de um banco; para ouro, faz o reconhecimento facial no app gov.br."
        />
      </>
    ),
  },
];

/* ---------------------------------------------------------------- prova final */
export type Questao = { p: string; o: string[]; c: number; e: string };
export const PROVA: Questao[] = [
  { p: 'Qual é o carro-chefe da Central de Assessoria Financeira?', o: ['Empréstimo consignado', 'Ressarcimento de juros abusivos', 'Seguro de vida'], c: 1, e: 'O nosso principal trabalho são os processos de ressarcimento de juros abusivos.' },
  { p: 'Com quem a gente trabalha?', o: ['Qualquer pessoa com empréstimo', 'Aposentados e pensionistas do INSS', 'Trabalhadores CLT'], c: 1, e: 'Só aposentados e pensionistas do INSS. CLT a gente descarta.' },
  { p: 'Quais são as três financeiras que mais chegam até a gente?', o: ['Agibank, Mercantil e BMG', 'Facta, Crefisa e BMG', 'Caixa, Itaú e Bradesco'], c: 0, e: 'As top 3 são Agibank, Mercantil e BMG. Também trabalhamos com Facta e Crefisa.' },
  { p: 'O processo pede o ressarcimento de quanto tempo de descontos?', o: ['Últimos 2 anos', 'Últimos 5 anos', 'Últimos 10 anos'], c: 2, e: 'O pedido cobre tudo o que foi descontado nos últimos 10 anos.' },
  { p: 'O cliente recebeu R$ 20.000. Quanto fica com ele?', o: ['R$ 20.000', 'R$ 14.000', 'R$ 6.000'], c: 1, e: '30% (R$ 6.000) são os honorários do advogado; o cliente fica com R$ 14.000.' },
  { p: 'O cliente veio pelo canal de empréstimo e não tem margem. O que fazer?', o: ['Descartar', 'Usar os ganchos e oferecer o processo', 'Pedir que volte mês que vem'], c: 1, e: 'Sem margem é a hora dos ganchos (aumento de margem, portabilidade acima de R$ 1.500) e do processo.' },
  { p: 'Estamos em outubro de 2026. Qual é o primeiro período do extrato de pagamento?', o: ['10/2025 a 10/2026', '11/2025 a 10/2026', '01/2026 a 12/2026'], c: 1, e: 'Início no mês seguinte do ano passado (11/2025) e fim no mês atual do ano atual (10/2026).' },
  { p: 'Do imposto de renda, o que pegamos?', o: ['Só o último ano', 'Print dos últimos 3 anos e, se declara, a DEC e o REC', 'Nada'], c: 1, e: 'Print de cada um dos últimos 3 anos; quem declara, também a DEC e o REC.' },
  { p: 'Qual comprovante de residência serve?', o: ['Qualquer um do último ano', 'Do mês atual ou do mês passado', 'Só se estiver no nome do cliente'], c: 1, e: 'Mês atual ou mês passado. No nome de outra pessoa também serve, com a identidade dela e uma declaração.' },
  { p: 'Para assinar as procurações pelo gov.br, a conta precisa estar em qual nível?', o: ['Qualquer nível', 'Bronze ou prata', 'Prata ou ouro'], c: 2, e: 'Bronze não assina. Prata (validação pelo banco) ou ouro (reconhecimento facial).' },
];
export const NOTA_MINIMA = 8;

/* ---------------------------------------------------------------- checklist (consulta rápida) */
export const CHECKLIST: { grupo: string; itens: string[] }[] = [
  { grupo: 'Meu INSS', itens: ['Carta de concessão', 'Extrato de consignado (Extrato de Empréstimos)', 'Extratos de pagamento dos últimos 10 anos'] },
  { grupo: 'gov.br', itens: ['Imposto de renda: print dos últimos 3 anos', 'DEC e REC (se o cliente declara)', 'Situação cadastral do CPF'] },
  { grupo: 'Documentos pessoais', itens: ['Identidade', 'Comprovante de residência (mês atual ou passado)', 'E-mail do cliente', 'Se o comprovante for de outra pessoa: identidade dela + declaração'] },
  { grupo: 'Fechamento', itens: ['Cliente cadastrado no admin', 'Procurações enviadas', 'Conta gov.br prata ou ouro', 'Procurações assinadas pelo gov.br'] },
];

export const MENSAGEM_DOCUMENTOS = [
  'Para darmos entrada no seu processo, vou precisar de:',
  '',
  '• Foto da sua identidade (frente e verso)',
  '• Comprovante de residência deste mês ou do mês passado',
  '• O seu e-mail',
  '',
  'Os documentos do Meu INSS e do gov.br a gente pode buscar junto com você. Qualquer dúvida, é só me chamar!',
].join('\n');
