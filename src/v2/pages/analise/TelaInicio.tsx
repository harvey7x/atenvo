/* Tela de início: arrastar/escolher os PDFs do Histórico de Créditos,
   lista dos escolhidos e "Analisar". Tudo no navegador. */
import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { BotaoPrimario, BotaoSec, CardVidro } from '../../components';
import { NOME_PRODUTO, tamanhoKB } from './conteudo';
import { CabecalhoTela, Giro, IconeCadeado, IconeDocumento, IconeEnviar, Rodape } from './comum';

export interface ProgressoLeitura { atual: number; total: number }

export function TelaInicio({ carregando, progresso, aoAnalisar }: {
  carregando: boolean;
  progresso: ProgressoLeitura | null;
  aoAnalisar: (arquivos: File[]) => void;
}) {
  const [escolhidos, setEscolhidos] = useState<File[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [semPdf, setSemPdf] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);

  function receber(lista: FileList | null) {
    if (!lista) return;
    // mesmo filtro do original: só nomes terminados em .pdf
    const pdfs = [...lista].filter((a) => /\.pdf$/i.test(a.name));
    setSemPdf(lista.length > 0 && pdfs.length === 0);
    if (!pdfs.length) return;
    setEscolhidos((atuais) => {
      const vistos = new Set(atuais.map((a) => a.name + '\u0000' + a.size));
      return [...atuais, ...pdfs.filter((a) => !vistos.has(a.name + '\u0000' + a.size))];
    });
  }

  function abrirSeletor() {
    if (!carregando) campoRef.current?.click();
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirSeletor(); }
  }

  function aoSoltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    if (!carregando) receber(e.dataTransfer.files);
  }

  return (
    <>
      <CabecalhoTela
        titulo="Extratos do INSS"
        sub={<>Leia os PDFs de “Histórico de Créditos” do Meu INSS e receba a linha do tempo dos pagamentos,
          todas as trocas de banco pagador e os indícios de troca ou desconto indevido.</>}
        ident={[
          { rotulo: 'Privacidade', valor: <span className="an-com-ic"><IconeCadeado />100% no navegador — os PDFs não são enviados a nenhum servidor</span> },
          { rotulo: 'Saída', valor: 'Relatório na tela · PDF · planilha Excel · HTML' },
        ]}
      />

      <div className="an-grade-inicio">
        <div className="an-coluna">
          <div
            className={'an-drop sobe' + (arrastando ? ' an-on' : '') + (carregando ? ' an-travada' : '')}
            role="button"
            tabIndex={carregando ? -1 : 0}
            aria-disabled={carregando}
            aria-label="Arraste os PDFs aqui ou clique para escolher"
            onClick={abrirSeletor}
            onKeyDown={aoTeclar}
            onDragEnter={(e) => { e.preventDefault(); if (!carregando) setArrastando(true); }}
            onDragOver={(e) => { e.preventDefault(); if (!carregando) setArrastando(true); }}
            onDragLeave={(e) => {
              e.preventDefault();
              // passar por cima de um filho também dispara dragleave: só apaga ao sair da zona
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
            }}
            onDrop={aoSoltar}
          >
            <span className="an-drop-ic"><IconeEnviar /></span>
            <span className="an-drop-tit">Arraste os PDFs aqui ou clique para escolher</span>
            <span className="an-drop-txt">
              Pode enviar vários de uma vez — cada ano costuma vir num arquivo separado.
              Eles são ordenados pela competência real, não pela ordem de envio.
            </span>
            <input
              ref={campoRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              // o campo fica DENTRO da zona: o clique programático não pode subir até ela
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { receber(e.target.files); e.target.value = ''; }}
            />
          </div>

          {semPdf && (
            <div className="aviso-inline erro" role="alert">
              Nenhum PDF entre os arquivos escolhidos — selecione os PDFs do Histórico de Créditos.
              <button type="button" onClick={() => setSemPdf(false)} aria-label="Fechar aviso">×</button>
            </div>
          )}

          {escolhidos.length > 0 && (
            <CardVidro className="an-lista-card sobe">
              <div className="card-cab">
                <h3>{escolhidos.length} PDF{escolhidos.length === 1 ? '' : 's'} escolhido{escolhidos.length === 1 ? '' : 's'}</h3>
                <BotaoSec mini disabled={carregando} onClick={() => setEscolhidos([])}>Limpar</BotaoSec>
              </div>
              <ul className="an-lista-arq">
                {escolhidos.map((a, i) => (
                  <li className="an-arq" key={a.name + '\u0000' + a.size}>
                    <span className="an-arq-ic"><IconeDocumento /></span>
                    <span className="an-arq-nome" title={a.name}>{a.name}</span>
                    <span className="an-arq-kb num">{tamanhoKB(a.size)}</span>
                    <button
                      type="button"
                      className="an-arq-tirar"
                      disabled={carregando}
                      onClick={() => setEscolhidos((atuais) => atuais.filter((_, k) => k !== i))}
                      aria-label={`Tirar ${a.name} da lista`}
                    >×</button>
                  </li>
                ))}
              </ul>
            </CardVidro>
          )}

          <div className="an-acoes sobe">
            <BotaoPrimario disabled={carregando || !escolhidos.length} onClick={() => aoAnalisar(escolhidos)}>
              {carregando ? 'Analisando…' : 'Analisar PDFs enviados'}
            </BotaoPrimario>
            {!escolhidos.length && !carregando && (
              <span className="an-acoes-dica">Escolha ao menos um PDF do Histórico de Créditos.</span>
            )}
          </div>

          {carregando && (
            <CardVidro className="an-carregando" role="status" aria-live="polite">
              <Giro />
              <div>
                <strong>Lendo os PDFs e montando o relatório…</strong>
                <p>
                  Extratos com muitos anos podem levar alguns segundos. Tudo acontece aqui no seu navegador.
                  {progresso && progresso.total > 1 && (
                    <span className="an-progresso num"> Arquivo {Math.min(progresso.atual, progresso.total)} de {progresso.total}.</span>
                  )}
                </p>
              </div>
            </CardVidro>
          )}
        </div>

        <div className="an-coluna">
          <CardVidro className="an-cartao sobe" style={{ animationDelay: '.06s' }}>
            <h4 className="an-cartao-tit">Como baixar o extrato certo</h4>
            <ol className="an-passos">
              <li>Entre em <strong>meu.inss.gov.br</strong> (ou no app Meu INSS) com a conta gov.br do titular.</li>
              <li>Procure por <strong>“Extrato de Pagamento”</strong> / <strong>“Histórico de Créditos”</strong>.</li>
              <li>Baixe o PDF de <strong>cada ano</strong> que quiser analisar e traga todos para cá.</li>
              <li>
                Para investigar empréstimos, baixe também o <strong>“Extrato de Empréstimo Consignado”</strong> —
                ele mostra o detalhe de cada contrato.
              </li>
            </ol>
          </CardVidro>

        </div>
      </div>

      <Rodape>
        {NOME_PRODUTO} · os PDFs são lidos e analisados no seu navegador, sem envio
        a servidores · aponta indícios, não prova fraude · não é aconselhamento jurídico.
      </Rodape>
    </>
  );
}
