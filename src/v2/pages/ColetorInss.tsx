/* Coletor INSS (Ferramentas · 30/09) — porta de entrada para o coletor que roda
   na MÁQUINA do atendente (localhost:4599).

   Por que só um botão, e não os controles aqui dentro: o Atenvo é servido pelo
   Cloudflare Pages (https) e o Chrome BLOQUEIA qualquer chamada de fundo de uma
   página pública para a rede local — testado nos dois esquemas, inclusive com
   certificado local confiável (https://localhost), e nos três casos a requisição
   é engolida sem erro. O que NÃO é bloqueado é abrir o endereço local numa aba.
   Então o Atenvo leva o atendente até o coletor, e o controle fica lá. */
import { BotaoPrimario, CardVidro, CardCab } from '../components';
import './ferramentas.css';

const COLETOR = 'http://localhost:4599';

const PASSOS = [
  'Abra o coletor no botão acima (ele roda no seu computador).',
  'Na janela do Chrome que ele abre, faça o login gov.br da pessoa — o captcha é sempre manual.',
  'Escolha os documentos e clique em Iniciar. Os PDFs vão para a pasta da pessoa, em Downloads.',
];

const DOCUMENTOS = [
  ['Extrato de Pagamento', 'Um PDF por ano, com a opção de juntar tudo num só.'],
  ['Extrato de Consignado', 'Somente os benefícios ativos.'],
  ['Carta de Concessão', 'Somente os benefícios ativos.'],
  ['Imposto de Renda', 'Os três últimos exercícios, pelo Portal MIR.'],
  ['Situação Cadastral no CPF', 'Comprovante da Receita — você só resolve o “Sou humano”.'],
];

export function ColetorInss() {
  return (
    <div className="ferr-wrap larga">
      <div className="ph sobe">
        <div>
          <div className="cob-migalha">Ferramentas</div>
          <h2>Coletor INSS</h2>
          <p>Baixa extratos, cartas e comprovantes do Meu INSS para a pasta da pessoa.</p>
        </div>
        <div className="acoes">
          <BotaoPrimario onClick={() => window.open(COLETOR, '_blank', 'noopener')}>
            Abrir o coletor
          </BotaoPrimario>
        </div>
      </div>

      <div className="ferr-layout sobe">
        <div className="ferr-col-in">
          <CardVidro spot>
            <CardCab titulo="Como funciona" />
            <div className="cl-corpo">
              <ol className="cl-passos">
                {PASSOS.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
              <div className="ferr-resumo">
                A coleta roda no seu computador, não no servidor — por isso o coletor precisa estar aberto aqui.
                Se o botão abrir uma aba com erro de conexão, é porque ele ainda não foi iniciado.
              </div>
            </div>
          </CardVidro>
        </div>

        <div className="ferr-col-out">
          <CardVidro spot>
            <CardCab titulo="O que ele baixa" />
            <div className="cl-corpo">
              <div className="cl-docs">
                {DOCUMENTOS.map(([nome, detalhe]) => (
                  <div className="cl-doc" key={nome}>
                    <b>{nome}</b>
                    <span>{detalhe}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardVidro>
        </div>
      </div>
    </div>
  );
}
