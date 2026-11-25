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
// o guia ÚNICO de instalação e uso (dono 25/11: "um único documento para eles lerem, o mais explicável possível")
const GUIA = 'guia-coletor-inss.pdf';
const GUIA_NOME = 'Guia de instalação do Coletor INSS - Reviza.pdf';

const DOCUMENTOS = [
  ['Extrato de Pagamento', 'Um PDF por ano, com a opção de juntar tudo num só.'],
  ['Extrato de Consignado', 'Somente os benefícios ativos.'],
  ['Carta de Concessão', 'Somente os benefícios ativos.'],
  ['Imposto de Renda', 'Os três últimos exercícios, pelo Portal MIR.'],
  ['Situação Cadastral no CPF', 'Comprovante da Receita — o “sou humano” é resolvido na hora.'],
];

/** Gera o link assinado (2 min) do arquivo e começa o download (o nome do arquivo vem no link). */
function useBaixar(arquivo: string, nome: string) {
  const { currentOrg } = useOrg();
  const [estado, setEstado] = useState<'livre' | 'gerando' | 'erro'>('livre');
  async function baixar() {
    if (!isSupabaseConfigured || !supabase) { setEstado('erro'); return; }
    setEstado('gerando');
    const { data, error } = await supabase.storage.from(BUCKET)
      .createSignedUrl(`${currentOrg.id}/${arquivo}`, 120, { download: nome });
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

/* crítica 12/11: a ação de todo dia ("Abrir o coletor") é a principal da tela; o guia de instalação,
   que se usa uma vez por computador, vira um bloco recolhível — aberto na primeira visita, fechado
   depois que a pessoa abre o coletor neste aparelho (preferência local, só conveniência) */
const CHAVE_USADO = 'reviza.coletor.usado';
const lerUsado = () => { try { return localStorage.getItem(CHAVE_USADO) === '1'; } catch { return false; } };

export function ColetorInss() {
  const { baixar, estado: estadoZip } = useBaixar(ARQUIVO, ARQUIVO);
  const guia = useBaixar(GUIA, GUIA_NOME);
  const estado = estadoZip === 'erro' || guia.estado === 'erro' ? 'erro' : estadoZip;
  const [instalacaoAberta, setInstalacaoAberta] = useState(() => !lerUsado());
  const abrirColetor = () => {
    try { localStorage.setItem(CHAVE_USADO, '1'); } catch { /* sem storage: só não lembra */ }
    window.open(COLETOR, '_blank', 'noopener');
  };
  const botaoBaixar = (
    <BotaoSec onClick={baixar} disabled={estadoZip === 'gerando'}>
      {estadoZip === 'gerando' ? 'Preparando o download…' : 'Baixar o Coletor para Windows'}
    </BotaoSec>
  );
  const botaoGuia = (rotulo: string) => (
    <BotaoSec onClick={guia.baixar} disabled={guia.estado === 'gerando'} title="Um PDF com a instalação e o uso, passo a passo, e o que fazer se der errado">
      {guia.estado === 'gerando' ? 'Preparando o guia…' : rotulo}
    </BotaoSec>
  );

  return (
    <div className="ferr-wrap larga">
      <div className="ph sobe">
        <div>
          <div className="cob-migalha">Ferramentas</div>
          <h2 title="Baixa os documentos do Meu INSS do cliente direto no notebook: extratos, consignado, carta de concessão, imposto de renda e situação cadastral">Coletor INSS</h2>
        </div>
        <div className="acoes">
          {botaoGuia('Guia de instalação (PDF)')}
          <BotaoPrimario onClick={abrirColetor} title="Abre o painel do coletor numa nova aba (só no notebook onde ele está instalado)">Abrir o coletor</BotaoPrimario>
        </div>
      </div>

      {estado === 'erro' && (
        <div className="clg-erro sobe" role="alert">
          Não foi possível gerar o download agora. Tente novamente em instantes; se o problema continuar, fale com o administrador.
        </div>
      )}

      <div className="clg-layout sobe">
        <div className="clg-principal">
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

        <CardVidro spot className={'clg-inst' + (instalacaoAberta ? ' aberta' : '')}>
          <button type="button" className="clg-inst-cab" aria-expanded={instalacaoAberta} aria-controls="clg-inst-passos" onClick={() => setInstalacaoAberta((v) => !v)}>
            <span className="clg-inst-tit">Instalação <span className="clg-sub">uma vez por computador · cerca de 5 minutos</span></span>
            <svg className="clg-inst-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {instalacaoAberta && (<>
          <div className="clg-guia">
            <div>
              <b>Antes de instalar, baixe e leia o guia</b>
              <p>Um PDF só, do começo ao fim: cada tela do Windows, o que clicar, o antivírus, o primeiro uso e o que fazer em cada aviso. Faça um passo de cada vez, na ordem.</p>
            </div>
            {botaoGuia('Baixar o guia de instalação (PDF)')}
          </div>
          <ol className="clg-passos" id="clg-inst-passos">
            <Passo n={1} titulo="Tenha o Google Chrome"
              acao={<a className="p-btn btn-sec" href={CHROME} target="_blank" rel="noopener noreferrer">Baixar o Chrome</a>}>
              O coletor usa o Chrome para o login gov.br. Se o notebook já tem o Chrome, pule este passo.
            </Passo>
            <Passo n={2} titulo="Baixe o Coletor"
              acao={botaoBaixar}
              dica="Uso interno da Reviza: não envie este arquivo para fora da empresa.">
              Arquivo <code>coletor-inss-windows.zip</code> (48 MB). Ele já vem com tudo o que precisa — não instale mais nada.
              Dentro dele também vem o guia: <b>LEIA PRIMEIRO - Guia de instalacao.pdf</b>.
            </Passo>
            <Passo n={3} titulo="Desbloqueie e extraia em C:\"
              dica="Não use OneDrive e não abra direto de dentro do zip — o instalador recusa.">
              Na pasta Downloads, clique com o botão direito no arquivo → <b>Propriedades</b> → marque <b>Desbloquear</b> → <b>OK</b>.
              Depois, botão direito de novo → <b>Extrair tudo…</b> → apague o caminho que aparece, digite <code>C:\</code> e
              clique em <b>Extrair</b>. Vai aparecer a pasta <code>C:\coletor-inss</code>.
            </Passo>
            <Passo n={4} titulo="Rode o instalador"
              dica={<>Se aparecer a tela azul “O Windows protegeu o computador”: <b>Mais informações</b> → <b>Executar assim mesmo</b>.</>}>
              Abra a pasta <code>C:\coletor-inss</code> e dê dois cliques em <b>Instalar.cmd</b>. Se o antivírus reclamar,
              siga os passos 3, 4 e 5 do guia (exclusões do antivírus) e rode de novo.
            </Passo>
            <Passo n={5} titulo="Ligue o início automático">
              O instalador confere o Chrome e cria o atalho <b>Coletor INSS</b> na Área de Trabalho. Quando ele perguntar
              “Abrir sozinho ao ligar o computador?”, digite <b>s</b> e aperte Enter.
            </Passo>
          </ol>
          </>)}
        </CardVidro>
        </div>

        <div className="clg-lado">
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
                <li>Erro na tela do coletor: no menu da esquerda do painel, abra <b>Registro técnico</b> → <b>Copiar tudo</b> e mande no grupo.</li>
                <li>Cada aviso que pode aparecer, e o que fazer, está no <b>Passo 10</b> do guia de instalação (PDF).</li>
              </ul>
            </div>
          </CardVidro>
        </div>
      </div>
    </div>
  );
}
