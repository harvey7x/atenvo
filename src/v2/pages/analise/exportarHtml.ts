/* Relatório HTML exportável — documento AUTÔNOMO (CSS próprio, inline, sem
   depender do app), sóbrio, no padrão visual da Reviza em versão de papel
   (claro, legível impresso). É o mesmo corpo do relatório da tela, como o
   corpoRelatorio(..., 'arquivo') do original. TODO valor passa por esc().
   Também alimenta o "Salvar em PDF" (impressão do documento num iframe —
   imprimir a aba do sistema levaria o menu, a barra e a rolagem junto). */
import AlfaMotor from '../../data/analise/motor';
import type { Dossie } from './tipos';
import {
  MOTIVOS_VAZIOS, NOME_PRODUTO, ROTULO_NIVEL_ALERTA, celulasDaLinha, esc, etiquetaTroca,
  larguraFaixa, montarConclusao, montarVeredito, tomDoNivel, type Paragrafo, type Tom,
} from './conteudo';

const CSS = `
:root{--txt:#191C22;--txt2:#565D68;--txt3:#868D98;--linha:#E2E5EA;--linha2:#EEF0F3;--fundo:#F4F5F7;--papel:#FFFFFF;
--marca:#23272E;--verde:#3E8E6B;--verde-bg:#EAF4EF;--ambar:#9E7A2E;--ambar-bg:#F7F1E4;--rubro:#B24A3C;--rubro-bg:#F9EDEB}
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--fundo);color:var(--txt);font-family:"Instrument Sans",Inter,"Segoe UI",system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}
.folha{max-width:1180px;margin:0 auto;padding:28px 24px 64px}
.num,td.num{font-variant-numeric:tabular-nums}
section{margin-bottom:30px;scroll-margin-top:64px}
.cab{background:var(--papel);border:1px solid var(--linha);border-top:3px solid var(--marca);border-radius:14px;padding:22px 24px 20px;margin-bottom:20px}
.sobre{font-size:10.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--txt3)}
h1{margin:4px 0 4px;font-size:21px;font-weight:650;letter-spacing:-.02em}
.sub{margin:0;color:var(--txt2);font-size:13px;max-width:80ch}
.ident{display:flex;flex-wrap:wrap;gap:10px 34px;margin:16px 0 0;padding-top:14px;border-top:1px solid var(--linha)}
.ident div{min-width:0}
.ident dt{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--txt3)}
.ident dd{margin:1px 0 0;font-weight:600;font-size:13px}
.veredito{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}
.selo{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:3px 10px;border-radius:99px;border:1px solid var(--linha);color:var(--txt2);background:var(--papel);white-space:nowrap}
.selo i{width:7px;height:7px;border-radius:50%;background:var(--txt3);flex:none}
.selo.alerta{color:var(--rubro);background:var(--rubro-bg);border-color:rgba(178,74,60,.3)}.selo.alerta i{background:var(--rubro)}
.selo.atencao{color:var(--ambar);background:var(--ambar-bg);border-color:rgba(158,122,46,.3)}.selo.atencao i{background:var(--ambar)}
.selo.ok{color:var(--verde);background:var(--verde-bg);border-color:rgba(62,142,107,.3)}.selo.ok i{background:var(--verde)}
nav{position:sticky;top:0;z-index:5;display:flex;gap:2px;flex-wrap:wrap;margin:0 0 22px;padding:7px 4px;background:rgba(244,245,247,.94);border-bottom:1px solid var(--linha)}
nav a{padding:6px 11px;border-radius:8px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--txt2);text-decoration:none}
nav a:hover{background:var(--papel);color:var(--txt)}
nav .conta{margin-left:5px;color:var(--txt3)}
h2{display:flex;align-items:center;gap:12px;margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--txt2)}
h2::after{content:"";flex:1;height:1px;background:var(--linha);min-width:24px}
.cartao{background:var(--papel);border:1px solid var(--linha);border-radius:14px;padding:18px 20px}
.cartao p{margin:0}.cartao p+p{margin-top:8px}
.forte-alerta{color:var(--rubro)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.kpi{background:var(--papel);border:1px solid var(--linha);border-radius:14px;padding:14px 16px}
.kpi .rot{font-size:12px;color:var(--txt2);font-weight:500}
.kpi .val{font-size:25px;font-weight:650;letter-spacing:-.02em;line-height:1.2;margin-top:6px;font-variant-numeric:tabular-nums}
.kpi.alerta .val{color:var(--rubro)}.kpi.atencao .val{color:var(--ambar)}.kpi.ok .val{color:var(--verde)}
.kpi .val.menor{font-size:19px}
.aviso{display:flex;gap:12px;background:var(--papel);border:1px solid var(--linha);border-left:3px solid var(--txt3);border-radius:12px;padding:13px 16px;margin-bottom:10px}
.aviso h3{margin:0 0 2px;font-size:14px;font-weight:600}
.aviso p{margin:0;font-size:13px;color:var(--txt2)}
.aviso.alerta{border-left-color:var(--rubro)}.aviso.alerta h3{color:var(--rubro)}
.aviso.atencao{border-left-color:var(--ambar)}.aviso.atencao h3{color:var(--ambar)}
.aviso .selo{margin-top:1px}
.faixas{display:flex;flex-direction:column;gap:8px}
.faixa{display:grid;grid-template-columns:250px minmax(0,1fr);gap:12px;align-items:center}
.faixa .nome{font-size:12.5px;font-weight:600;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.faixa .trilho{background:var(--linha2);border-radius:7px}
.faixa .barra{height:26px;border-radius:7px;background:#D9DDE3;color:var(--txt);font-size:11.5px;font-weight:500;display:flex;align-items:center;padding:0 10px;white-space:nowrap;min-width:fit-content;font-variant-numeric:tabular-nums}
.faixa .barra.risco{background:var(--rubro-bg);color:var(--rubro);box-shadow:inset 3px 0 0 var(--rubro)}
.nota{margin:14px 0 0;font-size:12.5px;color:var(--txt2)}
.troca{background:var(--papel);border:1px solid var(--linha);border-left:4px solid var(--linha);border-radius:12px;padding:16px 19px;margin-bottom:12px}
.troca.alerta{border-left-color:var(--rubro)}.troca.atencao{border-left-color:var(--ambar)}
.troca-topo{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.troca-topo h3{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em}
.fluxo{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:14px;align-items:center;margin-bottom:12px}
.caixa{background:var(--fundo);border:1px solid var(--linha);border-radius:10px;padding:11px 13px}
.quem{font-weight:600;font-size:13.5px}
.quando{font-size:12.5px;color:var(--txt2);margin-top:3px}
.seta{color:var(--txt3);font-size:18px}
.risco-tag{color:var(--rubro);font-weight:700}
.motivos{margin:0;padding-left:19px;font-size:13px;color:var(--txt2)}
.motivos li{margin-bottom:5px}
p.motivos{padding-left:0}
.rolagem{overflow-x:auto;border:1px solid var(--linha);border-radius:14px;background:var(--papel)}
table{border-collapse:collapse;width:100%;font-size:12.5px}
thead th{background:#F7F8FA;text-align:left;padding:10px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--txt3);font-weight:600;border-bottom:1px solid var(--linha);white-space:nowrap}
thead th.num{text-align:right}
tbody td{padding:8px 12px;border-bottom:1px solid var(--linha2);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
td.num{text-align:right;white-space:nowrap}
tr.troca-alerta{background:var(--rubro-bg)}tr.troca-atencao{background:var(--ambar-bg)}tr.troca-normal{background:#F7F8FA}
.sub-cel{display:block;color:var(--txt3);font-size:11.5px}
.rodape{margin-top:34px;padding-top:18px;border-top:1px solid var(--linha);font-size:12.5px;color:var(--txt2)}
.rodape p{margin:0 0 8px}.rodape strong{color:var(--txt)}
@media print{
  body{background:#fff;font-size:12px}
  .folha{max-width:none;padding:0}
  nav{display:none!important}
  .cab,.cartao,.kpi,.aviso,.troca,.rolagem{box-shadow:none}
  section,.troca,.aviso,.kpi{break-inside:avoid}
  .selo,.selo.alerta,.selo.atencao,.selo.ok{background:none}
  .faixa .trilho{background:none}
  .faixa .barra{background:none!important;border:1px solid var(--linha)}
  .faixa .barra.risco{border-color:var(--rubro);box-shadow:none}
  tr.troca-alerta,tr.troca-atencao,tr.troca-normal{background:none}
}
@media (max-width:720px){
  .folha{padding:18px 14px 56px}
  .fluxo{grid-template-columns:1fr}
  .seta{transform:rotate(90deg);text-align:center}
  .faixa{grid-template-columns:1fr}
  .faixa .nome{text-align:left}
}
`;

function selo(tom: Tom, texto: string): string {
  return `<span class="selo ${tom === 'neutro' ? '' : tom}"><i></i>${esc(texto)}</span>`;
}

function paragrafos(ps: Paragrafo[]): string {
  return ps.map((p) => '<p>' + p.map((tr) => {
    if (!tr.forte) return esc(tr.t);
    return `<strong${tr.alerta ? ' class="forte-alerta"' : ''}>${esc(tr.t)}</strong>`;
  }).join('') + '</p>').join('');
}

function quando(lado: { competencia: string; data_pagamento: string; meio_pagamento: string; op_nome: string }, rotulo: string): string {
  return `${rotulo}: ${esc(lado.competencia)}`
    + (lado.data_pagamento ? ` (creditado em ${esc(lado.data_pagamento)})` : '')
    + (lado.meio_pagamento ? `<br>${esc(lado.meio_pagamento)}` : '')
    + (lado.op_nome ? `<br>praça: ${esc(lado.op_nome)}` : '');
}

export interface ParamsRelatorioHtml {
  d: Dossie;
  indice: number;
  total: number;
  falhas: string[];
  reanalise: { paginas: number } | null;
}

/** Corpo do relatório (sem <html>): cabeçalho, avisos, navegação e seções. */
function corpo({ d, indice, total, falhas, reanalise }: ParamsRelatorioHtml, carimbo: string): string {
  const res = d.resumo;
  const cab = d.cabecalho;
  const ident: [string, string][] = [['Titular', cab.nome || 'não identificado no PDF']];
  if (cab.cpf) ident.push(['CPF', cab.cpf]);
  if (cab.beneficio) ident.push(['Benefício', cab.beneficio]);
  if (cab.especie) ident.push(['Espécie', cab.especie]);
  ident.push(['Período analisado', `${res.periodo_inicio} a ${res.periodo_fim}`]);
  ident.push(['Relatório gerado em', carimbo]);

  const veredito = montarVeredito(d).map((p) => selo(p.tom, p.texto)).join('');

  const avisoReanalise = reanalise ? `
  <div class="aviso atencao"><div>
    <h3>Análise refeita sem ${reanalise.paginas} página(s) removida(s)</h3>
    <p>Você removeu página(s) na tela "Unificar PDFs" e refez a análise só com as páginas mantidas — esta análise NÃO considera o conteúdo delas. Para voltar à análise completa, desfaça as remoções lá e reanalise de novo.</p>
  </div></div>` : '';

  const avisoMulti = total > 1 ? `
  <div class="aviso"><div>
    <h3>Benefício ${indice + 1} de ${total}</h3>
    <p>Este titular tem mais de um benefício. Cada espécie é analisada e entregue <strong>separadamente</strong> — juntar as duas linhas do tempo criaria trocas de banco que nunca existiram, já que num mesmo mês cada benefício pode ser pago por uma instituição diferente.</p>
  </div></div>` : '';

  const nav = `
  <nav aria-label="Seções do relatório">
    <a href="#sec-resumo">Resumo</a>
    <a href="#sec-conclusao">Conclusão</a>
    ${d.alertas.length ? `<a href="#sec-alertas">Alertas<span class="conta">${d.alertas.length}</span></a>` : ''}
    <a href="#sec-bancos">Bancos</a>
    <a href="#sec-trocas">Trocas<span class="conta">${d.trocas.length}</span></a>
    <a href="#sec-linha">Linha do tempo<span class="conta">${d.linha_do_tempo.length}</span></a>
  </nav>`;

  const kpiAssoc = res.total_associativo > 0 ? `
      <div class="kpi alerta"><div class="rot">descontado por associação/sindicato</div><div class="val menor">${esc(AlfaMotor.moeda(res.total_associativo))}</div></div>` : '';

  const alertas = d.alertas.length ? `
  <section id="sec-alertas">
    <h2>Alertas (${d.alertas.length})</h2>
    ${d.alertas.map((a) => `
    <div class="aviso ${a.nivel === 'normal' ? '' : esc(a.nivel)}">
      <div>${selo(tomDoNivel(a.nivel), ROTULO_NIVEL_ALERTA[a.nivel])}</div>
      <div><h3>${esc(a.titulo)}</h3><p>${esc(a.detalhe)}</p></div>
    </div>`).join('')}
  </section>` : '';

  const faixas = d.bancos.map((b) => `
      <div class="faixa">
        <div class="nome" title="${esc(b.codigo)} - ${esc(b.nome)}">${b.risco.risco ? '<span class="risco-tag">risco · </span>' : ''}${esc(b.codigo)} · ${esc(b.nome)}</div>
        <div class="trilho"><div class="barra${b.risco.risco ? ' risco' : ''}" style="width:${larguraFaixa(b.competencias, res.competencias)}%" title="${b.competencias} competência(s)">${esc(b.inicio_rotulo)} → ${esc(b.fim_rotulo)} (${b.competencias}m)</div></div>
      </div>`).join('');

  const trocas = d.trocas.map((t) => {
    const motivos = t.motivos.length
      ? `<ul class="motivos">${t.motivos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
      : `<p class="motivos">${esc(MOTIVOS_VAZIOS)}</p>`;
    return `
    <article class="troca ${t.nivel === 'normal' ? '' : esc(t.nivel)}">
      <div class="troca-topo">${selo(tomDoNivel(t.nivel), etiquetaTroca(t.nivel))}<h3>Troca ${t.ordem} — a partir da competência ${esc(t.para.competencia)}</h3></div>
      <div class="fluxo">
        <div class="caixa"><div class="quem">${esc(t.de.codigo)} · ${esc(t.de.nome)}</div><div class="quando">${quando(t.de, 'último pagamento')}</div></div>
        <div class="seta">→</div>
        <div class="caixa"><div class="quem">${esc(t.para.codigo)} · ${esc(t.para.nome)}${t.risco_destino.risco ? ' <span class="risco-tag">· lista de risco</span>' : ''}</div><div class="quando">${quando(t.para, 'primeiro pagamento')}</div></div>
      </div>
      ${motivos}
    </article>`;
  }).join('');

  const marcas = new Map(d.trocas.map((t) => [t.indice_depois, t.nivel]));
  const linhas = d.linha_do_tempo.map((r) => {
    const nivel = marcas.get(r.ordem);
    const c = celulasDaLinha(r);
    const consignado = c.consignado === null ? '—'
      : esc(c.consignado) + (c.contratos ? `<span class="sub-cel">${c.contratos} contrato(s)</span>` : '');
    return `
        <tr${nivel ? ` class="troca-${esc(nivel)}"` : ''}>
          <td><strong>${esc(r.competencia)}</strong></td>
          <td>${esc(r.data_pagamento || '—')}</td>
          <td>${nivel ? '<strong>↳ trocou aqui</strong><br>' : ''}${esc(r.banco_codigo)} · ${esc(r.banco_nome || '—')}</td>
          <td>${esc(r.op_codigo)} ${esc(r.op_nome)}</td>
          <td>${esc(r.meio_pagamento || '—')}</td>
          <td class="num">${esc(AlfaMotor.moeda(r.valor_mr))}</td>
          <td class="num">${esc(AlfaMotor.moeda(r.valor_liquido))}</td>
          <td class="num">${consignado}</td>
          <td class="num">${c.margemAlta ? `<span class="risco-tag">${esc(c.margem)}</span>` : esc(c.margem)}</td>
          <td class="num">${esc(c.associativo)}</td>
          <td>${esc(c.ocorrencia)}</td>
        </tr>`;
  }).join('');

  const rodapeArquivos = d.arquivos.map((a) => `${esc(a.arquivo)} (${a.competencias_lidas} competências)`).join(' · ');
  const rodapeFalhas = falhas.length
    ? `<br><strong class="forte-alerta">Falhas de leitura:</strong> ${esc(falhas.join('; '))}` : '';

  return `
  <header class="cab">
    <div class="sobre">${esc(NOME_PRODUTO)} · Histórico de Créditos</div>
    <h1>Análise de Extrato do INSS</h1>
    <p class="sub">Histórico de Créditos · linha do tempo de pagamentos, trocas de banco pagador e indícios de desconto indevido</p>
    <dl class="ident">${ident.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <div class="veredito">${veredito}</div>
  </header>
  ${avisoReanalise}
  ${avisoMulti}
  ${nav}
  <section id="sec-resumo">
    <h2>Resumo</h2>
    <div class="kpis">
      <div class="kpi"><div class="rot">competências analisadas</div><div class="val">${res.competencias}</div></div>
      <div class="kpi"><div class="rot">bancos pagadores distintos</div><div class="val">${res.bancos_distintos}</div></div>
      <div class="kpi${res.trocas ? ' atencao' : ''}"><div class="rot">trocas de banco no período</div><div class="val">${res.trocas}</div></div>
      <div class="kpi ${res.trocas_alerta ? 'alerta' : 'ok'}"><div class="rot">trocas para banco da lista de risco</div><div class="val">${res.trocas_alerta}</div></div>
      ${kpiAssoc}
    </div>
  </section>
  <section id="sec-conclusao">
    <h2>Conclusão da análise</h2>
    <div class="cartao">${paragrafos(montarConclusao(res))}</div>
  </section>
  ${alertas}
  <section id="sec-bancos">
    <h2>Bancos pagadores ao longo do tempo</h2>
    <div class="cartao">
      <div class="faixas">${faixas}</div>
      <p class="nota">A largura da barra é proporcional ao número de competências pagas por aquele banco. Barras em vermelho são instituições da lista de risco.</p>
    </div>
  </section>
  <section id="sec-trocas">
    <h2>Trocas de banco detectadas (${d.trocas.length})</h2>
    ${d.trocas.length ? '' : '<div class="cartao">Nenhuma troca de banco pagador no período analisado.</div>'}
    ${trocas}
  </section>
  <section id="sec-linha">
    <h2>Linha do tempo mês a mês (${d.linha_do_tempo.length} competências)</h2>
    <div class="rolagem">
      <table>
        <thead><tr>
          <th>Competência</th><th>Pagamento</th><th>Banco</th><th>Praça / OP</th><th>Meio</th>
          <th class="num">Bruto (MR)</th><th class="num">Valor líquido</th><th class="num">Consignado</th>
          <th class="num">Margem</th><th class="num">Assoc.</th><th>Ocorrência</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  </section>
  <footer class="rodape">
    <p><strong>Limites desta análise.</strong> Este relatório é gerado automaticamente a partir do que consta nos PDFs de Histórico de Créditos enviados. Ele aponta <strong>indícios</strong> e <strong>possíveis trocas indevidas</strong> — o extrato do INSS sozinho não prova fraude, e constar na lista de risco não significa que a instituição agiu de forma irregular neste caso. Nada aqui é aconselhamento jurídico.</p>
    <p><strong>Arquivos analisados:</strong> ${rodapeArquivos}${rodapeFalhas}</p>
    <p>${esc(NOME_PRODUTO)} v${esc(AlfaMotor.VERSAO)} · processamento 100% no navegador · gerado em ${esc(carimbo)}</p>
  </footer>`;
}

export function tituloRelatorio(d: Dossie): string {
  return 'Análise de extrato do INSS' + (d.cabecalho.nome ? ' — ' + d.cabecalho.nome : '');
}

/** Documento HTML completo e autônomo do relatório. */
export function montarHtmlRelatorio(params: ParamsRelatorioHtml): string {
  const carimbo = AlfaMotor.carimbo();
  return '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + `<title>${esc(tituloRelatorio(params.d))}</title>\n<style>${CSS}</style>\n</head>\n<body>\n`
    + `<div class="folha">${corpo(params, carimbo)}</div>\n`
    + '</body>\n</html>\n';
}

/** "Salvar em PDF": imprime o documento autônomo num iframe invisível — o
    navegador abre a janela de impressão (destino "Salvar como PDF"). */
export function imprimirHtml(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  let removido = false;
  const remover = () => {
    if (removido) return;
    removido = true;
    iframe.remove();
  };
  iframe.onload = () => {
    const janela = iframe.contentWindow;
    if (!janela) { remover(); return; }
    janela.addEventListener('afterprint', () => setTimeout(remover, 0));
    janela.focus();
    janela.print();
    // rede de segurança: navegadores que não disparam afterprint
    setTimeout(remover, 120000);
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
