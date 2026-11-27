/* Coletor INSS (Ferramentas · 30/10) — instalado no NOTEBOOK de cada atendente (Windows).

   Dono 30/10: "coloca mais pra cima, em Operação… um passo a passo com o que tem que
   fazer para usar o coletor no notebook da pessoa, que é Windows… o que tiver que fazer
   download, tu pode colocar também lá".

   O pacote (coletor-inss-windows.zip, ~47 MB) é PORTÁTIL: traz Node e Python dentro; o
   Windows só precisa do Chrome. Ele leva o atenvo.json com a chave da ponte do coletor,
   então NÃO fica na pasta public/ do site: mora no bucket privado `downloads-internos`
   (<org>/coletor-inss-windows.zip) e a tela gera um link assinado de 2 min na hora do
   clique — só quem é membro da organização baixa.

   "Abrir o coletor" leva ao painel local (127.0.0.1:4599) numa ABA: o Atenvo é https e o
   Chrome bloqueia chamadas de fundo para a rede local (testado) — abrir em aba funciona.
   Numa máquina sem o coletor dá erro de conexão, e está tudo bem. */
import { useState, type ReactNode } from 'react';
import { BotaoPrimario, BotaoSec, CardVidro, CardCab } from '../components';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import './ferramentas.css';

// 127.0.0.1 e NÃO localhost: no Windows o nome resolve para IPv6 (::1) antes
// do IPv4, e isso dava ERR_CONNECTION_REFUSED mesmo com o coletor rodando.
const COLETOR = 'http://127.0.0.1:4599';
const CHROME = 'https://www.google.com/intl/pt-BR/chrome/';
const BUCKET = 'downloads-internos';
const ARQUIVO = 'coletor-inss-windows.zip';

const DOCUMENTOS = [
  ['Extrato de Pagamento', 'Um PDF por ano, com a opção de juntar tudo num só.'],
  ['Extrato de Consignado', 'Somente os benefícios ativos.'],
  ['Carta de Concessão', 'Somente os benefícios ativos.'],
  ['Imposto de Renda', 'Os três últimos exercícios, pelo Portal MIR.'],
  ['Situação Cadastral no CPF', 'Comprovante da Receita — o “sou humano” é resolvido na hora.'],
];

/** Gera o link assinado do pacote e começa o download (o nome do arquivo vem no link). */
function useBaixarColetor() {
  const { currentOrg } = useOrg();
  const [estado, setEstado] = useState<'livre' | 'gerando' | 'erro'>('livre');
  async function baixar() {
    if (!isSupabaseConfigured || !supabase) { setEstado('erro'); return; }
    setEstado('gerando');
    const { data, error } = await supabase.storage.from(BUCKET)
      .createSignedUrl(`${currentOrg.id}/${ARQUIVO}`, 120, { download: ARQUIVO });
    if (error || !data?.signedUrl) { setEstado('erro'); return; }
    window.location.assign(data.signedUrl);
    setEstado('livre');
  }
  return { baixar, estado };
}

function Passo({ n, titulo, children, acao, dica }: { n: number; titulo: string; children: ReactNode; acao?: ReactNode; dica?: ReactNode }) {
  return (
    <li className="clg-passo">
      <span className="clg-n num" aria-hidden>{n}</span>
      <div className="clg-corpo">
        <b>{titulo}</b>
        <p>{children}</p>
        {acao && <div className="clg-acao">{acao}</div>}
        {dica && <p className="clg-dica">{dica}</p>}
      </div>
    </li>
  );
}

export function ColetorInss() {
  const { baixar, estado } = useBaixarColetor();
  const botaoBaixar = (
    <BotaoPrimario onClick={baixar} disabled={estado === 'gerando'}>
      {estado === 'gerando' ? 'Preparando o download…' : 'Baixar o Coletor para Windows'}
    </BotaoPrimario>
  );

  return (
    <div className="ferr-wrap larga">
      <div className="ph sobe">
        <div>
          <div className="cob-migalha">Ferramentas</div>
          <h2>Coletor INSS</h2>
          <p>Baixa os documentos do Meu INSS do cliente direto no seu notebook — extratos, consignado, carta, imposto de renda e situação cadastral.</p>
        </div>
        <div className="acoes">
          <BotaoSec onClick={() => window.open(COLETOR, '_blank', 'noopener')}>Abrir o coletor</BotaoSec>
        </div>
      </div>

      {estado === 'erro' && (
        <div className="clg-erro sobe" role="alert">
          Não consegui gerar o download agora. Tente de novo em instantes; se continuar, avise o Matheus.
        </div>
      )}

      <div className="clg-layout sobe">
        <CardVidro spot>
          <CardCab titulo="Instalar no notebook (Windows)" direita={<span className="clg-sub">Uma vez só · uns 5 minutos</span>} />
          <ol className="clg-passos">
            <Passo n={1} titulo="Tenha o Google Chrome"
              acao={<a className="p-btn btn-sec" href={CHROME} target="_blank" rel="noopener noreferrer">Baixar o Chrome</a>}>
              O coletor usa o Chrome para o login gov.br. Se o notebook já tem o Chrome, pule este passo.
            </Passo>
            <Passo n={2} titulo="Baixe o Coletor"
              acao={botaoBaixar}
              dica="Uso interno da CAF: não envie este arquivo para fora da empresa.">
              Arquivo <code>coletor-inss-windows.zip</code> (47 MB). Ele já vem com tudo o que precisa — não instale mais nada.
            </Passo>
            <Passo n={3} titulo="Extraia em C:\"
              dica="Não use OneDrive e não abra direto de dentro do zip — o instalador recusa.">
              Na pasta Downloads, clique com o botão direito no arquivo → <b>Extrair tudo…</b> → apague o caminho que aparece,
              digite <code>C:\</code> e clique em <b>Extrair</b>. Vai aparecer a pasta <code>C:\coletor-inss</code>.
            </Passo>
            <Passo n={4} titulo="Rode o instalador"
              dica={<>Se aparecer a tela azul “O Windows protegeu o computador”: <b>Mais informações</b> → <b>Executar assim mesmo</b>.</>}>
              Abra a pasta <code>C:\coletor-inss</code> e dê dois cliques em <b>Instalar.cmd</b>.
            </Passo>
            <Passo n={5} titulo="Ligue o início automático">
              O instalador confere o Chrome e cria o atalho <b>Coletor INSS</b> na Área de Trabalho. Quando ele perguntar
              “Abrir sozinho ao ligar o computador?”, digite <b>s</b> e aperte Enter.
            </Passo>
          </ol>
        </CardVidro>

        <div className="clg-lado">
          <CardVidro spot>
            <CardCab titulo="Usar no dia a dia" />
            <ol className="clg-passos compacto">
              <Passo n={1} titulo="Abra o coletor">
                Dois cliques no atalho <b>Coletor INSS</b> da Área de Trabalho. Abre uma janela preta — deixe aberta — e o painel no navegador.
              </Passo>
              <Passo n={2} titulo="Faça o login do cliente">
                Clique em <b>Abrir o Chrome para o login</b> e entre com o gov.br do cliente. O “sou humano” é sempre você.
              </Passo>
              <Passo n={3} titulo="Baixe os documentos">
                Confira o nome do cliente, escolha os documentos e clique em <b>Baixar os documentos</b>. Os PDFs ficam em
                Downloads, numa pasta com o nome do cliente.
              </Passo>
              <Passo n={4} titulo="Próximo cliente">
                Clique em <b>Trocar</b>, no topo do painel, antes de logar a próxima pessoa.
              </Passo>
            </ol>
          </CardVidro>

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

          <CardVidro spot>
            <CardCab titulo="Se algo não funcionar" />
            <div className="cl-corpo">
              <ul className="clg-ajuda">
                <li>A janela preta do coletor precisa ficar aberta enquanto você usa.</li>
                <li>O painel não abriu? Clique em <b>Abrir o coletor</b>, no topo desta página — só funciona no notebook onde ele está instalado.</li>
                <li>Erro na tela do coletor: abra <b>Detalhes técnicos</b> → <b>Copiar tudo</b> e mande no grupo.</li>
              </ul>
            </div>
          </CardVidro>
        </div>
      </div>
    </div>
  );
}
