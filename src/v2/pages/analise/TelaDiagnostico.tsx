/* Conferência da extração (diagnostico.html do original): para checar se o
   leitor entendeu o PDF — arquivos, texto bruto, campos por competência e o
   bloco de texto original de cada competência. */
import AlfaMotor from '../../data/analise/motor';
import { BotaoSec, CardVidro } from '../../components';
import { AvisoBloco, CabecalhoTela, Detalhe, Secao } from './comum';
import type { EstadoAnalise } from './tipos';

export function TelaDiagnostico({ estado, indice, aoVoltar, aoNovaAnalise }: {
  estado: EstadoAnalise;
  indice: number;
  aoVoltar: () => void;
  aoNovaAnalise: () => void;
}) {
  const d = estado.dossies[indice];
  return (
    <>
      <CabecalhoTela
        titulo="Conferência da extração"
        sub="Use esta página para checar se o leitor entendeu o PDF corretamente. Se algum campo veio vazio ou errado, é aqui que se vê o porquê."
      />

      <div className="an-acoes sobe">
        <BotaoSec onClick={aoVoltar}>Voltar ao relatório</BotaoSec>
        <BotaoSec onClick={aoNovaAnalise}>Nova análise</BotaoSec>
      </div>

      <Secao titulo="Arquivos lidos">
        <CardVidro className="an-tabela-caixa">
          <div className="an-rolagem-tab">
            <table className="an-tab">
              <thead><tr><th>Arquivo</th><th>Método de extração</th><th className="d">Competências lidas</th></tr></thead>
              <tbody>
                {d.arquivos.map((a, i) => (
                  <tr key={i}>
                    <td>{a.arquivo}</td>
                    <td>{a.metodo_extracao}</td>
                    <td className="d num">{a.competencias_lidas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardVidro>
        {estado.falhas.length > 0 && (
          <AvisoBloco tom="alerta" titulo="Falhas de leitura">{estado.falhas.join('; ')}</AvisoBloco>
        )}
      </Secao>

      <Secao titulo="Texto bruto de cada arquivo">
        <CardVidro className="an-cartao an-detalhes">
          {estado.textos.map((t, i) => (
            <Detalhe key={i} resumo={t.arquivo}>
              <pre className="an-pre">{t.texto}</pre>
            </Detalhe>
          ))}
        </CardVidro>
      </Secao>

      <Secao titulo="Campos lidos por competência">
        <CardVidro className="an-tabela-caixa">
          <div className="an-rolagem-tab">
            <table className="an-tab">
              <thead>
                <tr>
                  <th>Competência</th><th>Banco cód.</th><th>Banco nome</th><th>OP</th>
                  <th>Praça</th><th>Meio (sigla)</th><th>Data</th>
                  <th className="d">Valor</th><th className="d">Rubricas</th><th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {d.linha_do_tempo.map((r) => (
                  <tr key={r.ordem}>
                    <td className="num">{r.competencia}</td>
                    <td className="num">{r.banco_codigo || '—'}</td>
                    <td>{r.banco_nome || '—'}</td>
                    <td className="num">{r.op_codigo || '—'}</td>
                    <td>{r.op_nome || '—'}</td>
                    <td>{r.meio_pagamento_sigla || '—'}</td>
                    <td className="num">{r.data_pagamento || '—'}</td>
                    <td className="d num">{AlfaMotor.moeda(r.valor_liquido)}</td>
                    <td className="d num">{r.rubricas.length}</td>
                    <td>{r.arquivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardVidro>
      </Secao>

      <Secao titulo="Bloco de texto original de cada competência">
        <CardVidro className="an-cartao an-detalhes">
          {d.linha_do_tempo.map((r) => (
            <Detalhe key={r.ordem} resumo={<><span className="num">{r.competencia}</span> — {r.banco_codigo} {r.banco_nome}</>}>
              <pre className="an-pre">{r.texto_bruto}</pre>
            </Detalhe>
          ))}
        </CardVidro>
      </Secao>
    </>
  );
}
