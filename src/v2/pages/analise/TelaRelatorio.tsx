/* Relatório de um benefício (relatorio.html do original): veredito, resumo,
   conclusão, alertas, bancos ao longo do tempo, trocas e a linha do tempo
   mês a mês — com navegação fixa entre as seções. */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import AlfaMotor from '../../data/analise/motor';
import { BotaoPrimario, BotaoSec, CardVidro } from '../../components';
import {
  MOTIVOS_VAZIOS, NOME_PRODUTO, ROTULO_NIVEL_ALERTA, acharRolagem, celulasDaLinha, etiquetaTroca,
  larguraFaixa, montarConclusao, montarVeredito, semMovimento, tomDoNivel,
} from './conteudo';
import { AvisoBloco, CabecalhoTela, IconeSeta, Paragrafos, Rodape, Secao, Selo } from './comum';
import type { AvisoOperacao, Dossie, EstadoAnalise, Troca } from './tipos';

export type AcaoRelatorio = 'pdf' | 'xlsx' | 'html';

export function TelaRelatorio({
  estado, indice, aoExportar, ocupado, aviso, aoFecharAviso,
  aoDiagnostico, aoUnificar, aoBeneficios, aoNovaAnalise,
}: {
  estado: EstadoAnalise;
  indice: number;
  aoExportar: (acao: AcaoRelatorio) => void;
  /** exportação em andamento (desabilita os botões de download) */
  ocupado: AcaoRelatorio | null;
  aviso: AvisoOperacao | null;
  aoFecharAviso: () => void;
  aoDiagnostico: () => void;
  aoUnificar: () => void;
  aoBeneficios: () => void;
  aoNovaAnalise: () => void;
}) {
  const d = estado.dossies[indice];
  const total = estado.dossies.length;
  const res = d.resumo;
  const cab = d.cabecalho;
  const gerado = useMemo(() => AlfaMotor.carimbo(), []);
  // seções registradas por ref (a navegação fixa rola até elas e realça a visível)
  const secoes = useRef(new Map<string, HTMLElement>());
  const registros = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const registrar = (id: string) => {
    let fn = registros.current.get(id);
    if (!fn) {
      fn = (el: HTMLElement | null) => { if (el) secoes.current.set(id, el); else secoes.current.delete(id); };
      registros.current.set(id, fn);
    }
    return fn;
  };

  const ident = [{ rotulo: 'Titular', valor: cab.nome || 'não identificado no PDF' }];
  if (cab.cpf) ident.push({ rotulo: 'CPF', valor: cab.cpf });
  if (cab.beneficio) ident.push({ rotulo: 'Benefício', valor: cab.beneficio });
  if (cab.especie) ident.push({ rotulo: 'Espécie', valor: cab.especie });
  ident.push({ rotulo: 'Período analisado', valor: `${res.periodo_inicio} a ${res.periodo_fim}` });
  ident.push({ rotulo: 'Relatório gerado em', valor: gerado });

  return (
    <>
      <CabecalhoTela
        titulo="Análise de Extrato do INSS"
        sub="Histórico de Créditos · linha do tempo de pagamentos, trocas de banco pagador e indícios de desconto indevido"
        ident={ident}
      >
        <div className="an-veredito">
          {montarVeredito(d).map((p, i) => <Selo key={i} tom={p.tom}>{p.texto}</Selo>)}
        </div>
      </CabecalhoTela>

      <div className="an-acoes sobe">
        <BotaoPrimario disabled={ocupado !== null} onClick={() => aoExportar('pdf')}>Salvar em PDF</BotaoPrimario>
        <BotaoSec disabled={ocupado !== null} onClick={() => aoExportar('xlsx')}>
          {ocupado === 'xlsx' ? 'Gerando a planilha…' : 'Baixar planilha Excel'}
        </BotaoSec>
        <BotaoSec disabled={ocupado !== null} onClick={() => aoExportar('html')}>Baixar relatório HTML</BotaoSec>
        <BotaoSec onClick={aoDiagnostico}>Conferir extração</BotaoSec>
        {estado.pdfs.length > 0 && <BotaoSec onClick={aoUnificar}>Unificar PDFs</BotaoSec>}
        {total > 1 && <BotaoSec onClick={aoBeneficios}>Outros benefícios ({total})</BotaoSec>}
        <BotaoSec onClick={aoNovaAnalise}>Nova análise</BotaoSec>
      </div>
      <p className="an-acoes-nota">
        “Salvar em PDF” abre a janela de impressão do navegador — escolha o destino <strong>Salvar como PDF</strong>.
        A planilha e o HTML caem na pasta de downloads.
      </p>

      {aviso && (
        <div className={'aviso-inline' + (aviso.tom === 'erro' ? ' erro' : '')} role={aviso.tom === 'erro' ? 'alert' : 'status'}>
          {aviso.texto}
          <button type="button" onClick={aoFecharAviso} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {estado.reanalise && (
        <AvisoBloco tom="atencao" titulo={`Análise refeita sem ${estado.reanalise.paginas} página(s) removida(s)`}>
          Você removeu página(s) na tela “Unificar PDFs” e refez a análise só com as páginas mantidas — esta
          análise NÃO considera o conteúdo delas. Para voltar à análise completa, desfaça as remoções lá e
          reanalise de novo.
        </AvisoBloco>
      )}
      {total > 1 && (
        <AvisoBloco titulo={`Benefício ${indice + 1} de ${total}`}>
          Este titular tem mais de um benefício. Cada espécie é analisada e entregue <strong>separadamente</strong> —
          juntar as duas linhas do tempo criaria trocas de banco que nunca existiram, já que num mesmo mês cada
          benefício pode ser pago por uma instituição diferente.
        </AvisoBloco>
      )}

      <NavSecoes d={d} secoes={secoes} />

      <Secao refSecao={registrar('resumo')} titulo="Resumo">
        <div className="an-kpis">
          <Indicador rotulo="competências analisadas" valor={res.competencias} />
          <Indicador rotulo="bancos pagadores distintos" valor={res.bancos_distintos} />
          <Indicador rotulo="trocas de banco no período" valor={res.trocas} tom={res.trocas ? 'at' : undefined} />
          <Indicador rotulo="trocas para banco da lista de risco" valor={res.trocas_alerta} tom={res.trocas_alerta ? 'er' : 'ok'} />
          {res.total_associativo > 0 && (
            <Indicador rotulo="descontado por associação/sindicato" valor={AlfaMotor.moeda(res.total_associativo)} tom="er" menor />
          )}
        </div>
      </Secao>

      <Secao refSecao={registrar('conclusao')} titulo="Conclusão da análise">
        <CardVidro className="an-cartao">
          <Paragrafos ps={montarConclusao(res)} />
        </CardVidro>
      </Secao>

      {d.alertas.length > 0 && (
        <Secao refSecao={registrar('alertas')} titulo="Alertas" conta={d.alertas.length}>
          <ul className="an-alertas">
            {d.alertas.map((a, i) => (
              <li className={'an-alerta an-nivel-' + a.nivel} key={i}>
                <div className="an-alerta-topo">
                  <Selo tom={tomDoNivel(a.nivel)}>{ROTULO_NIVEL_ALERTA[a.nivel]}</Selo>
                  <span className="an-alerta-tit">{a.titulo}</span>
                </div>
                <p className="an-alerta-txt">{a.detalhe}</p>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao refSecao={registrar('bancos')} titulo="Bancos pagadores ao longo do tempo">
        <CardVidro className="an-cartao">
          <div className="an-faixas">
            {d.bancos.map((b, i) => (
              <div className="an-faixa" key={i}>
                <div className="an-faixa-nome" title={`${b.codigo} - ${b.nome}`}>
                  {b.risco.risco && <span className="an-ponto an-ponto-er" aria-label="lista de risco" role="img" />}
                  <span className="num">{b.codigo}</span> · {b.nome}
                </div>
                <div className="an-faixa-trilho">
                  <div
                    className={'an-faixa-barra num' + (b.risco.risco ? ' an-risco' : '')}
                    style={{ width: `${larguraFaixa(b.competencias, res.competencias)}%` }}
                    title={`${b.competencias} competência(s)`}
                  >
                    {b.inicio_rotulo} → {b.fim_rotulo} ({b.competencias}m)
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="an-nota">
            A largura da barra é proporcional ao número de competências pagas por aquele banco.
            Barras em vermelho são instituições da lista de risco.
          </p>
        </CardVidro>
      </Secao>

      <Secao refSecao={registrar('trocas')} titulo="Trocas de banco detectadas" conta={d.trocas.length}>
        {d.trocas.length === 0 && (
          <CardVidro className="an-cartao">Nenhuma troca de banco pagador no período analisado.</CardVidro>
        )}
        <div className="an-trocas">
          {d.trocas.map((t) => <CartaoTroca t={t} key={t.ordem} />)}
        </div>
      </Secao>

      <Secao refSecao={registrar('linha')} titulo={`Linha do tempo mês a mês (${d.linha_do_tempo.length} competências)`}>
        <LinhaDoTempo d={d} />
      </Secao>

      <Rodape>
        <p>
          <strong>Limites desta análise.</strong> Este relatório é gerado automaticamente a partir do que consta
          nos PDFs de Histórico de Créditos enviados. Ele aponta <strong>indícios</strong> e <strong>possíveis
          trocas indevidas</strong> — o extrato do INSS sozinho não prova fraude, e constar na lista de risco não
          significa que a instituição agiu de forma irregular neste caso. Nada aqui é aconselhamento jurídico.
        </p>
        <p>
          <strong>Arquivos analisados:</strong>{' '}
          {d.arquivos.map((a) => `${a.arquivo} (${a.competencias_lidas} competências)`).join(' · ')}
          {estado.falhas.length > 0 && (
            <><br /><strong className="an-forte-alerta">Falhas de leitura:</strong> {estado.falhas.join('; ')}</>
          )}
        </p>
        <p>{NOME_PRODUTO} · processamento 100% no navegador · gerado em {gerado}</p>
      </Rodape>
    </>
  );
}

/* ---------------------------------------------------------- indicador (KPI) */
function Indicador({ rotulo, valor, tom, menor }: {
  rotulo: string;
  valor: number | string;
  tom?: 'ok' | 'at' | 'er';
  menor?: boolean;
}) {
  return (
    <CardVidro className={'an-kpi' + (tom ? ' an-kpi-' + tom : '')}>
      <span className="an-kpi-rot">{rotulo}</span>
      <span className={'an-kpi-val num' + (menor ? ' an-menor' : '') + (tom ? ' an-tom-' + tom : '')}>{valor}</span>
    </CardVidro>
  );
}

/* ---------------------------------------------------------- troca de banco */
function CartaoTroca({ t }: { t: Troca }) {
  return (
    <article className={'an-troca an-nivel-' + t.nivel}>
      <div className="an-troca-topo">
        <Selo tom={tomDoNivel(t.nivel)}>{etiquetaTroca(t.nivel)}</Selo>
        <h5 className="an-troca-tit">Troca {t.ordem} — a partir da competência <span className="num">{t.para.competencia}</span></h5>
      </div>
      <div className="an-fluxo">
        <div className="an-fluxo-caixa">
          <div className="an-fluxo-quem">{t.de.codigo} · {t.de.nome}</div>
          <div className="an-fluxo-quando">
            último pagamento: <span className="num">{t.de.competencia}</span>
            {t.de.data_pagamento && <> (creditado em <span className="num">{t.de.data_pagamento}</span>)</>}
            {t.de.meio_pagamento && <><br />{t.de.meio_pagamento}</>}
            {t.de.op_nome && <><br />praça: {t.de.op_nome}</>}
          </div>
        </div>
        <div className="an-fluxo-seta" aria-hidden><IconeSeta /></div>
        <div className="an-fluxo-caixa">
          <div className="an-fluxo-quem">
            {t.para.codigo} · {t.para.nome}
            {t.risco_destino.risco && <span className="an-risco-tag"> · lista de risco</span>}
          </div>
          <div className="an-fluxo-quando">
            primeiro pagamento: <span className="num">{t.para.competencia}</span>
            {t.para.data_pagamento && <> (creditado em <span className="num">{t.para.data_pagamento}</span>)</>}
            {t.para.meio_pagamento && <><br />{t.para.meio_pagamento}</>}
            {t.para.op_nome && <><br />praça: {t.para.op_nome}</>}
          </div>
        </div>
      </div>
      {t.motivos.length
        ? <ul className="an-motivos">{t.motivos.map((m, i) => <li key={i}>{m}</li>)}</ul>
        : <p className="an-motivos an-motivos-vazio">{MOTIVOS_VAZIOS}</p>}
    </article>
  );
}

/* ---------------------------------------------------------- linha do tempo */
function LinhaDoTempo({ d }: { d: Dossie }) {
  const marcas = useMemo(() => new Map(d.trocas.map((t) => [t.indice_depois, t.nivel])), [d]);
  return (
    <CardVidro className="an-tabela-caixa">
      <div className="an-rolagem-tab">
        <table className="an-tab">
          <thead>
            <tr>
              <th>Competência</th><th>Pagamento</th><th>Banco</th><th>Praça / OP</th><th>Meio</th>
              <th className="d">Bruto (MR)</th><th className="d">Valor líquido</th><th className="d">Consignado</th>
              <th className="d">Margem</th><th className="d">Assoc.</th><th>Ocorrência</th>
            </tr>
          </thead>
          <tbody>
            {d.linha_do_tempo.map((r) => {
              const nivel = marcas.get(r.ordem);
              const c = celulasDaLinha(r);
              return (
                <tr key={r.ordem} className={nivel ? 'an-tr-' + nivel : undefined}>
                  <td className="num"><strong>{r.competencia}</strong></td>
                  <td className="num">{r.data_pagamento || '—'}</td>
                  <td>
                    {nivel && <><strong className="an-trocou">↳ trocou aqui</strong><br /></>}
                    {r.banco_codigo} · {r.banco_nome || '—'}
                  </td>
                  <td>{r.op_codigo} {r.op_nome}</td>
                  <td>{r.meio_pagamento || '—'}</td>
                  <td className="d num">{AlfaMotor.moeda(r.valor_mr)}</td>
                  <td className="d num">{AlfaMotor.moeda(r.valor_liquido)}</td>
                  <td className="d num">
                    {c.consignado === null ? '—' : (
                      <>{c.consignado}{c.contratos > 0 && <span className="an-td-sub">{c.contratos} contrato(s)</span>}</>
                    )}
                  </td>
                  <td className="d num">{c.margemAlta ? <span className="an-risco-tag">{c.margem}</span> : c.margem}</td>
                  <td className="d num">{c.associativo}</td>
                  <td>{c.ocorrencia}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CardVidro>
  );
}

/* ---------------------------------------------------------- navegação fixa */
function NavSecoes({ d, secoes }: { d: Dossie; secoes: MutableRefObject<Map<string, HTMLElement>> }) {
  const navRef = useRef<HTMLElement>(null);
  const itens = useMemo(() => {
    const lista: { id: string; rotulo: string; conta?: number }[] = [
      { id: 'resumo', rotulo: 'Resumo' },
      { id: 'conclusao', rotulo: 'Conclusão' },
    ];
    if (d.alertas.length) lista.push({ id: 'alertas', rotulo: 'Alertas', conta: d.alertas.length });
    lista.push({ id: 'bancos', rotulo: 'Bancos' });
    lista.push({ id: 'trocas', rotulo: 'Trocas', conta: d.trocas.length });
    lista.push({ id: 'linha', rotulo: 'Linha do tempo', conta: d.linha_do_tempo.length });
    return lista;
  }, [d]);
  const [ativa, setAtiva] = useState<string>('resumo');
  // a área que rola tem padding no topo: a barra gruda na BORDA dela (sem
  // deixar uma faixa de conteúdo passando por cima)
  const [topo, setTopo] = useState(0);
  useEffect(() => {
    const raiz = acharRolagem(navRef.current);
    if (raiz) setTopo(-(parseFloat(getComputedStyle(raiz).paddingTop) || 0));
  }, []);

  // clique na navegação: o realce fica no item clicado enquanto a rolagem
  // suave acontece (solta 160ms depois do último evento de rolagem)
  const travado = useRef(false);
  const destravar = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Realce da seção visível: a ÚLTIMA seção cujo topo já passou da linha de
     leitura logo abaixo da barra fixa; no fim da rolagem, a última seção.
     Determinístico — com o IntersectionObserver, uma seção curta (Bancos)
     clicada acabava realçando a seguinte (Trocas), que também cruzava a faixa. */
  useEffect(() => {
    const raiz = acharRolagem(navRef.current);
    const alvo: EventTarget = raiz ?? window;
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      if (travado.current || !itens.length) return;
      const topoRaiz = raiz ? raiz.getBoundingClientRect().top : 0;
      const linha = topoRaiz + (navRef.current?.offsetHeight ?? 0) + 40;
      let atual = itens[0].id;
      for (const it of itens) {
        const el = secoes.current.get(it.id);
        if (el && el.getBoundingClientRect().top <= linha) atual = it.id;
      }
      const rolou = raiz ? raiz.scrollTop : window.scrollY;
      const noFim = raiz
        ? raiz.scrollTop + raiz.clientHeight >= raiz.scrollHeight - 4
        : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (rolou > 0 && noFim) atual = itens[itens.length - 1].id;
      setAtiva(atual);
    };
    const aoRolar = () => {
      if (travado.current) {
        if (destravar.current) clearTimeout(destravar.current);
        destravar.current = setTimeout(() => { travado.current = false; }, 160);
        return;
      }
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    alvo.addEventListener('scroll', aoRolar, { passive: true });
    medir();
    return () => {
      alvo.removeEventListener('scroll', aoRolar);
      if (quadro) cancelAnimationFrame(quadro);
      if (destravar.current) clearTimeout(destravar.current);
    };
  }, [itens, secoes]);

  function ir(id: string) {
    const el = secoes.current.get(id);
    if (!el) return;
    travado.current = true;
    if (destravar.current) clearTimeout(destravar.current);
    // se nada rolar (a seção já está no lugar), destrava sozinho
    destravar.current = setTimeout(() => { travado.current = false; }, 400);
    setAtiva(id);
    el.scrollIntoView({ behavior: semMovimento() ? 'auto' : 'smooth', block: 'start' });
  }

  return (
    <nav className="an-nav" aria-label="Seções do relatório" ref={navRef} style={topo ? { top: topo } : undefined}>
      {itens.map((it) => (
        <button
          type="button"
          key={it.id}
          className={'an-nav-btn' + (ativa === it.id ? ' an-on' : '')}
          aria-current={ativa === it.id ? 'true' : undefined}
          onClick={() => ir(it.id)}
        >
          {it.rotulo}
          {it.conta !== undefined && <span className="an-nav-conta num">{it.conta}</span>}
        </button>
      ))}
    </nav>
  );
}
