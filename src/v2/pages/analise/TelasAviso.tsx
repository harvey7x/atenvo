/* Telas de exceção: "sem dados" (leu o texto, mas nenhuma competência casou
   com os layouts conhecidos) e "erro" (não deu para ler/analisar). */
import { BotaoPrimario, CardVidro } from '../../components';
import { CabecalhoTela, Detalhe, Secao } from './comum';
import type { ArquivoDeTabela, EstadoAnalise } from './tipos';

export function TelaSemDados({ estado, aoVoltar }: { estado: EstadoAnalise; aoVoltar: () => void }) {
  const d0 = estado.dossies[0];
  const arquivos: ArquivoDeTabela[] = d0 && d0.arquivos.length ? d0.arquivos : estado.arquivosLidos;
  return (
    <>
      <CabecalhoTela
        tom="atencao"
        titulo="Li os PDFs, mas não encontrei competências"
        sub="O texto foi extraído, só que o layout não bateu com os padrões conhecidos do “Histórico de Créditos”."
      />

      <CardVidro className="an-cartao sobe">
        <h4 className="an-cartao-tit">O que verificar</h4>
        <ul className="an-lista-check">
          <li>
            O PDF é mesmo o <strong>Histórico de Créditos / Extrato de Pagamento</strong> do Meu INSS?
            (O “Extrato de Empréstimo Consignado” tem outro formato.)
          </li>
          <li>
            O PDF é <strong>digitalizado</strong> (foto/scan)? Nesse caso não há texto para ler — baixe
            novamente direto do Meu INSS.
          </li>
          <li>
            Se o texto abaixo mostra os dados corretamente, é o leitor que precisa de ajuste para este
            layout — copie o trecho e mande para o Matheus.
          </li>
        </ul>
      </CardVidro>

      <Secao titulo="Arquivos lidos">
        <CardVidro className="an-tabela-caixa">
          <div className="an-rolagem-tab">
            <table className="an-tab">
              <thead><tr><th>Arquivo</th><th>Método</th><th>Texto encontrado?</th></tr></thead>
              <tbody>
                {arquivos.map((a, i) => (
                  <tr key={i}>
                    <td>{a.arquivo}</td>
                    <td>{a.metodo_extracao || '—'}</td>
                    <td>{a.sem_texto ? <span className="an-risco-tag">não — PDF sem camada de texto</span> : 'sim'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardVidro>
      </Secao>

      <Secao titulo="Primeiros 4000 caracteres extraídos">
        <div className="an-textos">
          {estado.textos.map((t, i) => (
            <div key={i}>
              <p className="an-texto-arq">{t.arquivo}</p>
              <pre className="an-pre">{t.texto.slice(0, 4000)}</pre>
            </div>
          ))}
        </div>
      </Secao>

      <div className="an-acoes">
        <BotaoPrimario onClick={aoVoltar}>Voltar</BotaoPrimario>
      </div>
    </>
  );
}

export function TelaErro({ titulo, mensagem, detalhe, aoVoltar }: {
  titulo: string;
  mensagem: string;
  detalhe: string;
  aoVoltar: () => void;
}) {
  return (
    <>
      <CabecalhoTela tom="alerta" titulo={titulo} sub="Nenhum dado foi perdido — os PDFs continuam onde estavam." />

      <CardVidro className="an-cartao sobe" role="alert">
        <p className="an-par"><strong>Mensagem:</strong> {mensagem}</p>
        <p className="an-par an-par-fraco">
          Causas mais comuns: o PDF é uma imagem escaneada (sem camada de texto), está protegido por senha,
          ou não é o “Histórico de Créditos” do Meu INSS.
        </p>
      </CardVidro>

      {detalhe && (
        <CardVidro className="an-cartao an-detalhes">
          <Detalhe resumo="Detalhe técnico">
            <pre className="an-pre an-pre-livre">{detalhe}</pre>
          </Detalhe>
        </CardVidro>
      )}

      <div className="an-acoes">
        <BotaoPrimario onClick={aoVoltar}>Voltar</BotaoPrimario>
      </div>
    </>
  );
}
