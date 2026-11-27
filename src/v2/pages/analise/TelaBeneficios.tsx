/* Escolha do benefício — quando o titular tem mais de um no extrato, cada
   espécie tem a sua própria análise (beneficios.html do original). */
import { useMemo } from 'react';
import AlfaMotor from '../../data/analise/motor';
import { BotaoSec } from '../../components';
import { NOME_PRODUTO } from './conteudo';
import { AvisoBloco, CabecalhoTela, IconeSeta, Rodape, Secao, Selo } from './comum';
import type { EstadoAnalise } from './tipos';

export function TelaBeneficios({ estado, aoAbrir, aoUnificar, aoNovaAnalise }: {
  estado: EstadoAnalise;
  aoAbrir: (indice: number) => void;
  aoUnificar: () => void;
  aoNovaAnalise: () => void;
}) {
  const dossies = estado.dossies;
  const cab0 = dossies[0].cabecalho;
  const gerado = useMemo(() => AlfaMotor.carimbo(), []);

  const ident = [{ rotulo: 'Titular', valor: cab0.nome || 'não identificado' }];
  if (cab0.cpf) ident.push({ rotulo: 'CPF', valor: cab0.cpf });
  ident.push({ rotulo: 'Benefícios', valor: String(dossies.length) });
  ident.push({ rotulo: 'Gerado em', valor: gerado });

  return (
    <>
      <CabecalhoTela
        titulo="Benefícios encontrados"
        sub="Este titular tem mais de um benefício no extrato. Cada espécie tem a sua própria análise — escolha qual quer abrir."
        ident={ident}
      />

      <div className="an-acoes sobe">
        {estado.pdfs.length > 0 && <BotaoSec onClick={aoUnificar}>Unificar PDFs</BotaoSec>}
        <BotaoSec onClick={aoNovaAnalise}>Nova análise</BotaoSec>
      </div>

      {estado.reanalise && (
        <AvisoBloco tom="atencao" titulo={`Análise refeita sem ${estado.reanalise.paginas} página(s) removida(s)`}>
          Estas análises não consideram as páginas removidas na tela “Unificar PDFs”.
          Para voltar à análise completa, desfaça as remoções lá e reanalise.
        </AvisoBloco>
      )}
      <AvisoBloco titulo="Por que separado">
        Analisar os dois benefícios juntos criaria trocas de banco que nunca aconteceram: num mesmo mês,
        cada benefício pode ser pago por uma instituição diferente, e a comparação mês a mês leria isso
        como mudança de conta. Cada espécie tem o seu próprio relatório, planilha e PDF.
      </AvisoBloco>

      <Secao titulo="Escolha o benefício" atraso={0.06}>
        <div className="an-beneficios">
          {dossies.map((d, i) => {
            const especie = d.cabecalho.especie || 'Espécie não identificada';
            if (!d.linha_do_tempo.length) {
              return (
                <div className="an-benef an-benef-vazio" key={i}>
                  <strong>{especie}</strong> — nenhuma competência foi lida para este benefício.
                </div>
              );
            }
            const nivel = d.resumo.alertas_criticos ? 'alerta' : (d.alertas.length ? 'atencao' : '');
            return (
              <button type="button" className={'an-benef' + (nivel ? ' an-nivel-' + nivel : '')} key={i} onClick={() => aoAbrir(i)}>
                <span className="an-benef-topo">
                  <span className="an-benef-tit">{especie}</span>
                  {nivel === 'alerta' && <Selo tom="alerta">Alerta</Selo>}
                  {nivel === 'atencao' && <Selo tom="atencao">Atenção</Selo>}
                </span>
                <span className="an-benef-nb num">
                  {d.cabecalho.beneficio ? `Benefício ${d.cabecalho.beneficio} · ` : ''}
                  {d.resumo.periodo_inicio} a {d.resumo.periodo_fim}
                </span>
                <span className="an-benef-numeros">
                  <span><small>Competências</small><b className="num">{d.resumo.competencias}</b></span>
                  <span><small>Bancos</small><b className="num">{d.resumo.bancos_distintos}</b></span>
                  <span><small>Trocas de banco</small><b className="num">{d.resumo.trocas}</b></span>
                  <span><small>Trocas de risco</small><b className={'num' + (d.resumo.trocas_alerta ? ' an-tom-er' : '')}>{d.resumo.trocas_alerta}</b></span>
                  <span><small>Alertas</small><b className="num">{d.alertas.length}</b></span>
                </span>
                <span className="an-benef-abrir">Abrir a análise deste benefício <IconeSeta tam={14} /></span>
              </button>
            );
          })}
        </div>
      </Secao>

      <Rodape>
        {NOME_PRODUTO} · processamento 100% no navegador · aponta indícios,
        não provas · não é aconselhamento jurídico.
      </Rodape>
    </>
  );
}
