/* Coletor INSS (Ferramentas · 05/10) — modelo central.

   O atendente NÃO instala nada: pede os documentos na FICHA do cliente
   (Contatos ou Kanban → "Pedir documentos do INSS"). O pedido entra na fila do
   coletor, que roda num único computador do escritório; quem está lá faz o
   login gov.br do cliente e dispara. No final, os PDFs sobem para o Atenvo e
   aparecem na própria ficha, para baixar de qualquer máquina.

   O botão "Abrir o coletor" abaixo é para o COMPUTADOR DA COLETA (o Atenvo é
   https e o Chrome bloqueia chamadas de fundo para a rede local — testado;
   abrir numa aba é o que funciona). Em qualquer outra máquina ele dá erro de
   conexão, e está tudo bem: o resto da equipe usa só a ficha. */
import { BotaoPrimario, CardVidro, CardCab } from '../components';
import './ferramentas.css';

// 127.0.0.1 e NÃO localhost: no Windows o nome resolve para IPv6 (::1) antes
// do IPv4, e isso dava ERR_CONNECTION_REFUSED mesmo com o coletor rodando.
const COLETOR = 'http://127.0.0.1:4599';

const PASSOS = [
  'Abra a ficha do cliente (em Contatos ou no Kanban) e clique em “Pedir documentos do INSS”.',
  'O pedido entra na fila do computador da coleta. Quem está lá faz o login gov.br do cliente — o “sou humano” é sempre uma pessoa.',
  'Quando a coleta termina, os PDFs aparecem na mesma ficha, prontos para baixar. Nada para instalar na sua máquina.',
];

const DOCUMENTOS = [
  ['Extrato de Pagamento', 'Um PDF por ano, com a opção de juntar tudo num só.'],
  ['Extrato de Consignado', 'Somente os benefícios ativos.'],
  ['Carta de Concessão', 'Somente os benefícios ativos.'],
  ['Imposto de Renda', 'Os três últimos exercícios, pelo Portal MIR.'],
  ['Situação Cadastral no CPF', 'Comprovante da Receita — o “sou humano” é resolvido na hora.'],
];

export function ColetorInss() {
  return (
    <div className="ferr-wrap larga">
      <div className="ph sobe">
        <div>
          <div className="cob-migalha">Ferramentas</div>
          <h2>Coletor INSS</h2>
          <p>Peça os documentos do Meu INSS na ficha do cliente — eles voltam para a ficha como PDF.</p>
        </div>
        <div className="acoes">
          <BotaoPrimario onClick={() => window.open(COLETOR, '_blank', 'noopener')}>
            Abrir o coletor (computador da coleta)
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
                O botão acima é só para o computador onde a coleta roda (o que faz o login gov.br).
                Se abrir uma aba com erro de conexão, você não está nele — peça pela ficha do cliente.
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
