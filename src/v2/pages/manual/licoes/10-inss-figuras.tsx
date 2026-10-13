/* Lição 10 — ilustrações e treinos próprios (prefixo mv-ins-): a conta gov.br
   como chave, os três documentos anotados, o passo a passo no aplicativo (tela
   por tela), a régua dos 12 meses, a tabela de exemplos, o encaixe dos 10 anos
   (com os erros comuns), a vida da senha, o caminho de cada cliente, o exercício
   de conferir o PDF e o checklist final. Telas do app e documentos em papel têm
   paleta própria (são "de fora") e levam a tag Ilustração. Dados de exemplo:
   a cliente fictícia Lúcia, a mesma da lição 3 (consignados no Banco A, Banco B
   e BMG, valores iguais aos de lá). Os extratos mostram CONSIGNADOS: nenhuma
   legenda pode tratá-los como o alvo do processo (que é o empréstimo pessoal).
   Estilos em 10-inss.css. */
import { useState, type ReactNode } from 'react';
import { Figura, IcCheck, IcX, Tabela } from '../pecas';
import { hojeMesAno } from '../ilustracoes';
import { MESES, MESES_CURTOS, mmaaaa, periodosDoExtrato, type MesAno, type Periodo } from '../periodos';

const Ico = ({ children }: { children: ReactNode }) => <span className="mv-ins-ico" aria-hidden>{children}</span>;
const idx = (m: MesAno) => m.ano * 12 + m.mes - 1;

/* ícones de traço (usam a cor do texto) */
const IcBalao = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M4 5.5h16v10H9.5L5.5 19v-3.5H4z" /></svg>;
const IcChave = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M21 12v2" /></svg>;
const IcDoc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M6 3.5h8l4 4V20.5H6z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h6" /></svg>;
const IcCadeado = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 018 0v2.5" /></svg>;
const IcTroca = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 8.5A7.5 7.5 0 006 6.5L4.5 8M5 15.5a7.5 7.5 0 0013 2L19.5 16" /><path d="M4.5 4v4h4M19.5 20v-4h-4" /></svg>;

/* ===================================================================== 1. uma chave, várias portas */
const PORTAS = [
  { t: 'Meu INSS', d: 'carta e os dois extratos', tag: 'esta lição', y: 22, atual: true },
  { t: 'Meu Imposto de Renda', d: 'imposto de renda, últimos 3 anos', tag: 'a seguir', y: 117, atual: false },
  { t: 'Assinatura digital', d: 'procurações (prata ou ouro)', tag: 'adiante', y: 212, atual: false },
];
const ROTULO_US = 'A conta gov.br, com CPF e senha, abre três portas: o Meu INSS (esta lição), o Meu Imposto de Renda e a assinatura digital das procurações. A senha do Meu INSS é a senha do gov.br.';
export function UmaSenhaVariasPortas() {
  return (
    <Figura tag="Diagrama" legenda="A conta gov.br é a chave: com o mesmo CPF e a mesma senha, o cliente entra no Meu INSS, no Meu Imposto de Renda e assina as procurações.">
      <div className="mv-ins-cq">
        <svg className="mv-ins-us-largo" viewBox="0 0 760 300" role="img" aria-label={ROTULO_US}>
          {PORTAS.map((p) => (
            <path key={p.t} className="mv-ins-us-fio" data-atual={p.atual ? '' : undefined}
              d={`M256,150 C356,150 376,${p.y + 35} 476,${p.y + 35}`} />
          ))}
          <rect className="mv-ins-us-pilula" x="352" y="138" width="116" height="26" rx="13" />
          <text className="mv-ins-us-pt" x="410" y="155" textAnchor="middle">mesma senha</text>

          <rect className="mv-ins-us-chave" x="16" y="92" width="240" height="116" rx="14" />
          <g className="mv-ins-us-ic" aria-hidden>
            <circle cx="54" cy="150" r="13" />
            <path d="M67,150 H92 M84,150 V160 M91,150 V157" />
          </g>
          <text className="mv-ins-us-t" x="104" y="136">Conta gov.br</text>
          <text className="mv-ins-us-s" x="104" y="158">CPF + senha</text>
          <text className="mv-ins-us-s2" x="104" y="179">a mesma para tudo</text>
          <text className="mv-ins-us-s" x="136" y="240" textAnchor="middle">Senha do Meu INSS = senha do gov.br</text>

          {PORTAS.map((p) => (
            <g key={p.t} className="mv-ins-us-porta" data-atual={p.atual ? '' : undefined}>
              <rect x="476" y={p.y} width="268" height="70" rx="12" />
              <text className="mv-ins-us-pt1" x="494" y={p.y + 30}>{p.t}</text>
              <text className="mv-ins-us-tag" x="728" y={p.y + 30} textAnchor="end">{p.tag}</text>
              <text className="mv-ins-us-s" x="494" y={p.y + 52}>{p.d}</text>
            </g>
          ))}
        </svg>
        {/* versão estreita (coluna de celular): HTML empilhado, para a letra não encolher */}
        <div className="mv-ins-us-html">
          <div className="mv-ins-us-h-chave">
            <span className="mv-ins-us-h-ic" aria-hidden><IcChave /></span>
            <span><b>Conta gov.br</b><span>CPF + senha</span><small>a mesma para tudo</small></span>
          </div>
          <span className="mv-ins-us-h-pilula">mesma senha</span>
          <ul className="mv-ins-us-h-portas">
            {PORTAS.map((p) => (
              <li key={p.t} data-atual={p.atual ? '' : undefined}>
                <span className="mv-ins-us-h-lin"><b>{p.t}</b><em>{p.tag}</em></span>
                <span>{p.d}</span>
              </li>
            ))}
          </ul>
          <small className="mv-ins-us-h-rod">Senha do Meu INSS = senha do gov.br</small>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== tabela que vira cartões */
/** A Tabela do manual quando há espaço; cartões empilhados quando a coluna fica estreita (celular),
    para nenhuma coluna ficar escondida atrás de rolagem lateral. */
export function TabelaResponsiva({ colunas, linhas, destaque, corte = 'medio', compacto }: {
  colunas: string[]; linhas: ReactNode[][]; destaque?: number; corte?: 'medio' | 'largo';
  /** valores curtos: no cartão, rótulo e valor ficam na mesma linha */
  compacto?: boolean;
}) {
  return (
    <div className="mv-ins-cq">
      <div className="mv-ins-tr" data-corte={corte} data-compacto={compacto ? '' : undefined}>
        <div className="mv-ins-tr-tab"><Tabela colunas={colunas} linhas={linhas} destaque={destaque} /></div>
        <ul className="mv-ins-tr-cards">
          {linhas.map((l, i) => (
            <li key={i} className="vidro">
              <span className="mv-ins-tr-cab"><small>{colunas[0]}</small><b>{l[0]}</b></span>
              <dl>
                {l.slice(1).map((c, k) => (
                  <div key={k}>
                    <dt>{colunas[k + 1]}</dt>
                    <dd data-destaque={destaque === k + 1 ? '' : undefined}>{c}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ===================================================================== 2a. consignado × pessoal nos documentos */
/* Só os fatos da correção do dono (13/10). Cores iguais às da lição 3: consignado = azul, pessoal = âmbar. */
const DOIS_EMPRESTIMOS: { tom: 'azul' | 'ambar'; t: string; s: string; itens: { r: string; d: string; forte?: boolean }[] }[] = [
  {
    tom: 'azul', t: 'Empréstimo consignado', s: 'o INSS desconta',
    itens: [
      { r: 'Como é pago', d: 'A parcela é descontada direto do benefício pelo INSS, antes de o dinheiro cair na conta.' },
      { r: 'Juros', d: 'Têm um teto definido para o consignado do INSS. São os mais baratos para o aposentado.' },
      { r: 'Onde aparece', d: 'No Extrato de Empréstimo Consignado e como desconto no extrato de pagamento do benefício.' },
      { r: 'Na CAF', d: 'Gancho do canal de empréstimo: o “sem margem”, a possibilidade de aumento de margem e a de portabilidade dos consignados.', forte: true },
    ],
  },
  {
    tom: 'ambar', t: 'Empréstimo pessoal', s: 'a financeira cobra',
    itens: [
      { r: 'Como é pago', d: 'Contrato direto com a financeira, fora do INSS. Em geral, cobrado na conta do cliente ou por boleto ou carnê.' },
      { r: 'Juros', d: 'Livres, sem o teto do consignado, e em geral bem mais altos.' },
      { r: 'Onde aparece', d: 'Não aparece como desconto do INSS. O cliente costuma lembrar pelo nome do banco e pelo débito na conta.' },
      { r: 'Na CAF', d: 'É o objeto do processo: a revisão dos juros do empréstimo pessoal e o ressarcimento.', forte: true },
    ],
  },
];
export function ConsignadoOuPessoal() {
  return (
    <Figura tag="Comparativo" legenda="Os dois empréstimos do aposentado, lado a lado. Os extratos do Meu INSS mostram o consignado; o processo da CAF revisa os juros do empréstimo pessoal. A diferença completa está na lição 3.">
      <div className="mv-ins-cq"><div className="mv-ins-dp">
        {DOIS_EMPRESTIMOS.map((c) => (
          <section key={c.t} className="mv-ins-dp-col" data-tom={c.tom} aria-label={c.t}>
            <div className="mv-ins-dp-cab"><b>{c.t}</b><span>{c.s}</span></div>
            {c.itens.map((it) => (
              <div key={it.r} className="mv-ins-dp-it" data-forte={it.forte ? '' : undefined}>
                <small>{it.r}</small>
                <span>{it.d}</span>
              </div>
            ))}
          </section>
        ))}
      </div></div>
    </Figura>
  );
}

/* ===================================================================== 2. documentos anotados */
type Nota = { t: string; d: ReactNode };
const Marca = ({ n }: { n: number }) => <span className="mv-ins-marca" aria-hidden>{n}</span>;

/** Documento em papel (paleta própria) + notas numeradas. Tocar numa nota destaca o campo. */
function PapelAnotado({ legenda, titulo, sub, notas, children }: {
  legenda: string; titulo: string; sub: string; notas: Nota[]; children: ReactNode;
}) {
  const [ativa, setAtiva] = useState<number | null>(null);
  return (
    <Figura legenda={legenda}>
      <div className="mv-ins-cq"><div className="mv-ins-pa">
        <div className="mv-ins-papel" data-ativa={ativa ?? undefined}>
          <div className="mv-ins-papel-cab">
            <b>{titulo}</b>
            <small>{sub}</small>
          </div>
          {children}
          <span className="mv-ins-papel-selo">dados de exemplo</span>
        </div>
        <div className="mv-ins-notas-w">
          <span className="mv-ins-notas-dica">Toque num item para ver onde ele fica no documento.</span>
          <ol className="mv-ins-notas">
            {notas.map((n, i) => (
              <li key={n.t}>
                <button type="button" className="mv-ins-nota" aria-pressed={ativa === i + 1}
                  onClick={() => setAtiva(ativa === i + 1 ? null : i + 1)}>
                  <span className="mv-ins-nota-n num">{i + 1}</span>
                  <span className="mv-ins-nota-tx"><b>{n.t}</b><span>{n.d}</span></span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div></div>
    </Figura>
  );
}

function Campo({ m, rotulo, valor, largo }: { m: number; rotulo: string; valor: string; largo?: boolean }) {
  return (
    <div className="mv-ins-campo" data-m={m} data-largo={largo ? '' : undefined}>
      <Marca n={m} />
      <small>{rotulo}</small>
      <b>{valor}</b>
    </div>
  );
}

export function DocCarta() {
  return (
    <PapelAnotado titulo="Carta de Concessão" sub="Meu INSS · documento ilustrado e simplificado"
      legenda="Carta de concessão simplificada, com dados de exemplo. O documento real tem mais texto, mas estes são os pontos que você confere."
      notas={[
        { t: 'Nome do titular', d: 'Tem que ser quem recebe o benefício: o cliente ou, na rota do familiar, o familiar que recebe.' },
        { t: 'Número do benefício (NB)', d: 'A “identidade” do benefício. Ele aparece também nos extratos: serve para conferir se tudo é do mesmo benefício.' },
        { t: 'Espécie', d: 'O tipo do benefício: aposentadoria, pensão, auxílio, BPC/LOAS. Qualquer benefício do INSS serve.' },
        { t: 'Data de início', d: 'Desde quando o benefício é pago. Antes dessa data não existe extrato de pagamento.' },
        { t: 'Valor inicial', d: 'Quanto o benefício valia no começo. O valor de hoje costuma ser outro, por causa dos reajustes.' },
      ]}>
      <div className="mv-ins-campos">
        <Campo m={1} rotulo="Nome do titular" valor="LÚCIA MARIA DOS SANTOS" largo />
        <Campo m={2} rotulo="Número do benefício (NB)" valor="123.456.789-0" />
        <Campo m={3} rotulo="Espécie" valor="Aposentadoria por idade" />
        <Campo m={4} rotulo="Data de início do benefício" valor="15/03/2014" />
        <Campo m={5} rotulo="Renda mensal inicial" valor="R$ 1.250,00" />
      </div>
      <div className="mv-ins-linhas" aria-hidden><i /><i /><i data-curta="" /></div>
    </PapelAnotado>
  );
}

const CONTRATOS = [
  { b: 'BANCO A', ini: '03/2021', parc: '84', v: 'R$ 310,00' },
  { b: 'BANCO B', ini: '08/2022', parc: '84', v: 'R$ 240,00' },
  { b: 'BMG', ini: '01/2024', parc: '84', v: 'R$ 150,00' },
];
export function DocConsignado() {
  return (
    <PapelAnotado titulo="Extrato de Empréstimo Consignado" sub="também aparece como Histórico de Empréstimo Consignado"
      legenda="Extrato de consignado simplificado, com os consignados da cliente de exemplo (Banco A e Banco B são genéricos). Tudo o que aparece nele é consignado, descontado pelo INSS. No real, a arrumação e os nomes das colunas mudam: procure estas informações."
      notas={[
        { t: 'Titular e benefício', d: 'Mesmo nome e mesmo número de benefício da carta de concessão.' },
        { t: 'Margem', d: 'Quanto ainda cabe de parcela nova de consignado. “Disponível R$ 0,00” é o cliente sem margem, como você viu na lição 3.' },
        { t: 'Banco de cada contrato', d: 'Com quem é cada consignado. Um nome conhecido aqui (como o BMG) é consignado, e não o empréstimo pessoal que o processo revisa.' },
        { t: 'Parcelas e valor', d: 'Quantas parcelas o contrato tem e quanto o INSS desconta do benefício todo mês.' },
        { t: 'Início do desconto', d: 'Desde quando cada contrato desconta do benefício.' },
        { t: 'Cartões consignados', d: 'RMC e RCC aparecem separados dos empréstimos. Não pule esta parte.' },
      ]}>
      <div className="mv-ins-campos">
        <Campo m={1} rotulo="Titular · benefício" valor="LÚCIA MARIA DOS SANTOS · 123.456.789-0" largo />
      </div>
      <div className="mv-ins-margem" data-m={2}>
        <Marca n={2} />
        <span className="mv-ins-margem-tit">Margem para empréstimos</span>
        <div className="mv-ins-margem-vs">
          <span className="mv-ins-margem-v"><small>máximo</small><b className="num">R$ 700,00</b></span>
          <span className="mv-ins-margem-v"><small>comprometido</small><b className="num">R$ 700,00</b></span>
          <span className="mv-ins-margem-v" data-zero=""><small>disponível</small><b className="num">R$ 0,00</b></span>
        </div>
      </div>
      <span className="mv-ins-ptab-tit">Contratos ativos</span>
      <div className="mv-ins-ptab-w">
        <table className="mv-ins-ptab">
          <thead>
            <tr>
              <th scope="col" data-m={3}><Marca n={3} />Banco</th>
              <th scope="col" data-m={5}><Marca n={5} />Início</th>
              <th scope="col" data-m={4}><Marca n={4} />Parcelas</th>
              <th scope="col" data-m={4}>Valor/mês</th>
            </tr>
          </thead>
          <tbody>
            {CONTRATOS.map((c) => (
              <tr key={c.b}>
                <td data-m={3}><b>{c.b}</b></td>
                <td data-m={5} className="num">{c.ini}</td>
                <td data-m={4} className="num">{c.parc}</td>
                <td data-m={4} className="num">{c.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mv-ins-cartoes" data-m={6}>
        <Marca n={6} />
        <div><span><b>Cartão de crédito consignado (RMC)</b> · BMG</span><span className="num">R$ 100,00</span></div>
        <div><span><b>Cartão consignado de benefício (RCC)</b> · BANCO A</span><span className="num">R$ 100,00</span></div>
      </div>
    </PapelAnotado>
  );
}

const DESCONTOS = [
  ['Consignado · BANCO A', '310,00'], ['Consignado · BANCO B', '240,00'], ['Consignado · BMG', '150,00'],
  ['Cartão RMC · BMG', '100,00'], ['Cartão RCC · BANCO A', '100,00'],
];
export function DocHiscre() {
  return (
    <PapelAnotado titulo="Histórico de Créditos" sub="Extrato de Pagamento de Benefício · 1 dos 10 arquivos"
      legenda="Um arquivo do extrato de pagamento, simplificado (Banco A e Banco B são genéricos). Cada arquivo traz 12 meses; aqui aparece só o mês mais recente por inteiro."
      notas={[
        { t: 'Titular e benefício', d: 'Os mesmos da carta. Confira nos 10 arquivos.' },
        { t: 'Período', d: 'As datas pedidas na consulta. Têm que bater com a lista dos 10 períodos.' },
        { t: 'Competência', d: 'O mês daquele pagamento. Cada arquivo traz 12 blocos como este, um por mês.' },
        { t: 'Descontos do INSS', d: 'Cada desconto numa linha. Os de empréstimo e de cartão, com o nome do banco, são consignados. O empréstimo pessoal não aparece como desconto do INSS.' },
        { t: 'Valor líquido', d: 'O que caiu na conta do cliente depois dos descontos.' },
      ]}>
      <div className="mv-ins-campos">
        <Campo m={1} rotulo="Titular · benefício" valor="LÚCIA MARIA DOS SANTOS · 123.456.789-0" largo />
        <Campo m={2} rotulo="Período consultado" valor="11/2025 a 10/2026" largo />
      </div>
      <div className="mv-ins-comp">
        <div className="mv-ins-comp-cab" data-m={3}><Marca n={3} /><b>Competência 10/2026</b></div>
        <div className="mv-ins-comp-lin"><span>Valor do benefício (bruto)</span><b className="num">R$ 2.000,00</b></div>
        <div className="mv-ins-comp-desc" data-m={4}>
          <Marca n={4} />
          {DESCONTOS.map(([r, v]) => (
            <div key={r} className="mv-ins-comp-lin" data-desc=""><span>{r}</span><span className="num">− R$ {v}</span></div>
          ))}
        </div>
        <div className="mv-ins-comp-lin" data-liq="" data-m={5}><Marca n={5} /><span>Valor líquido</span><b className="num">R$ 1.100,00</b></div>
      </div>
      <div className="mv-ins-comp" data-apagado="">
        <div className="mv-ins-comp-cab"><b>Competência 09/2026</b></div>
        <div className="mv-ins-comp-lin"><span>Valor do benefício (bruto)</span><b className="num">R$ 2.000,00</b></div>
      </div>
      <span className="mv-ins-mais">+ mais 10 meses neste mesmo arquivo</span>
    </PapelAnotado>
  );
}

/* ===================================================================== 3. passo a passo no aplicativo */
type DocId = 'carta' | 'cons' | 'pag';
type DocApp = { id: DocId; curto: string; busca: string; nome: string; tambem?: string; arquivo: string };
const DOC_APP: Record<DocId, DocApp> = {
  carta: { id: 'carta', curto: 'Carta de concessão', busca: 'carta de concessão', nome: 'Carta de Concessão', arquivo: 'carta-de-concessao.pdf' },
  cons: { id: 'cons', curto: 'Extrato de consignado', busca: 'extrato de empréstimo', nome: 'Extrato de Empréstimo Consignado', tambem: 'Histórico de Empréstimo Consignado', arquivo: 'extrato-emprestimo.pdf' },
  pag: { id: 'pag', curto: 'Extrato de pagamento', busca: 'extrato de pagamento', nome: 'Extrato de Pagamento de Benefício', tambem: 'Histórico de Créditos', arquivo: 'historico-de-creditos.pdf' },
};
type PassoId = 'abrir' | 'entrar' | 'cpf' | 'senha' | 'busca' | 'resultado' | 'periodo' | 'pdf' | 'enviar';
type TextoPasso = { titulo: string; faz: ReactNode; atencao: ReactNode };

function textoDoPasso(id: PassoId, d: DocApp, p: Periodo): TextoPasso {
  switch (id) {
    case 'abrir': return {
      titulo: 'Abrir o aplicativo Meu INSS',
      faz: 'No celular, toque no ícone do Meu INSS. Quem não tem o aplicativo pode baixar de graça na loja de aplicativos do próprio celular, ou usar o site meu.inss.gov.br.',
      atencao: 'Se o aplicativo pedir atualização, atualize antes de seguir. Use sempre o aplicativo oficial do governo.',
    };
    case 'entrar': return {
      titulo: 'Tocar em “Entrar com gov.br”',
      faz: 'O Meu INSS não tem senha própria: quem abre a porta é a conta gov.br. Este botão leva para a tela de entrada do gov.br.',
      atencao: 'O cliente diz que “não tem senha do INSS”? Pergunte pela senha do gov.br: é a mesma.',
    };
    case 'cpf': return {
      titulo: 'Digitar o CPF e tocar em “Continuar”',
      faz: 'O gov.br pede o CPF de quem recebe o benefício, o titular.',
      atencao: 'Na rota do familiar, o CPF e a senha são do familiar que recebe o benefício, e não de quem está conversando com você.',
    };
    case 'senha': return {
      titulo: 'Digitar a senha do gov.br e tocar em “Entrar”',
      faz: 'É a mesma senha que o cliente usa em outros serviços do governo.',
      atencao: <>Esqueceu? A própria tela tem a opção “Esqueci minha senha”. Se o gov.br pedir um código ou uma confirmação e for <b>você</b> entrando com a senha do cliente, pare e fale com o seu gestor.</>,
    };
    case 'busca': return {
      titulo: 'Tocar na busca “Do que você precisa?”',
      faz: 'Ela fica no alto da tela inicial. Em vez de procurar nos menus, você escreve o nome do documento.',
      atencao: 'A tela inicial muda com as atualizações do aplicativo. Se o cliente não achar a busca, peça um print da tela.',
    };
    case 'resultado': return {
      titulo: `Escrever “${d.busca}” e tocar no resultado`,
      faz: <>Toque em <b>{d.nome}</b>{d.tambem && <> (pode aparecer como <b>{d.tambem}</b>)</>}.</>,
      atencao: d.id === 'carta'
        ? 'Se o cliente tem mais de um benefício, o aplicativo pode pedir para escolher qual. Anote os números e pergunte ao seu gestor.'
        : 'Existem dois extratos: o de empréstimo mostra os contratos consignados; o de pagamento mostra os meses. Não troque um pelo outro.',
    };
    case 'periodo': return {
      titulo: 'Preencher o início e o fim do período',
      faz: <>Pela regra: início no mês seguinte, do ano passado; fim no mês atual. Hoje, o ano 1 é <b className="num">{mmaaaa(p.inicio)} a {mmaaaa(p.fim)}</b>. Depois, repita mais 9 vezes, descendo um ano.</>,
      atencao: 'É o passo em que mais se erra. Use a calculadora de períodos e marque cada ano que chegar.',
    };
    case 'pdf': return {
      titulo: 'Abrir o documento e baixar o PDF',
      faz: 'O aplicativo mostra o documento na tela. Toque em baixar (ou em compartilhar) para gerar o arquivo em PDF.',
      atencao: 'O PDF baixado pelo aplicativo é melhor que foto da tela: sai inteiro e nítido.',
    };
    default: return {
      titulo: 'Mandar o PDF na conversa do WhatsApp',
      faz: 'Pelo botão de compartilhar, o cliente escolhe o WhatsApp e a conversa com a CAF. Se for você entrando com a senha do cliente, guarde os arquivos onde o seu gestor orientar.',
      atencao: 'Confira o arquivo assim que ele chegar, com o cliente ainda na conversa (seção 8 desta lição).',
    };
  }
}

const APPS: { n: string; l: string; cor: string; alvo?: boolean }[] = [
  { n: 'Fotos', l: 'F', cor: 'laranja' }, { n: 'Agenda', l: 'A', cor: 'azul-claro' }, { n: 'Relógio', l: 'R', cor: 'cinza' },
  { n: 'Banco', l: 'B', cor: 'roxo' }, { n: 'gov.br', l: 'gov', cor: 'gov' }, { n: 'Meu INSS', l: 'INSS', cor: 'inss', alvo: true },
  { n: 'Notas', l: 'N', cor: 'laranja' }, { n: 'Clima', l: 'C', cor: 'azul-claro' },
];
const DOCK: { n: string; l: string; cor: string }[] = [
  { n: 'Telefone', l: 'T', cor: 'verde' }, { n: 'WhatsApp', l: 'W', cor: 'zap' }, { n: 'Câmera', l: 'C', cor: 'cinza' }, { n: 'Internet', l: 'I', cor: 'azul-claro' },
];

function TopoInss({ titulo, sub }: { titulo: string; sub?: string }) {
  return <div className="mv-ins-t-topo"><b>{titulo}</b>{sub && <span>{sub}</span>}</div>;
}

function TelaApp({ id, d, p }: { id: PassoId; d: DocApp; p: Periodo }) {
  switch (id) {
    case 'abrir': return (
      <div className="mv-ins-t-home">
        <div className="mv-ins-t-relogio num">10:24</div>
        <div className="mv-ins-t-apps">
          {APPS.map((a) => (
            <div key={a.n} className="mv-ins-t-app" data-alvo={a.alvo ? '' : undefined}>
              <i data-cor={a.cor}>{a.l}</i><span>{a.n}</span>
            </div>
          ))}
        </div>
        <div className="mv-ins-t-dock">
          {DOCK.map((a) => <i key={a.n} data-cor={a.cor} title={a.n}>{a.l}</i>)}
        </div>
      </div>
    );
    case 'entrar': return (
      <div className="mv-ins-t-boas">
        <div className="mv-ins-t-marca">Meu INSS</div>
        <span className="mv-ins-t-bv">Bem-vindo(a)</span>
        <div className="mv-ins-t-bt" data-alvo="">Entrar com gov.br</div>
      </div>
    );
    case 'cpf': return (
      <div className="mv-ins-t-gov">
        <div className="mv-ins-t-govtopo">gov.br</div>
        <b>Identifique-se no gov.br</b>
        <small>Número do CPF</small>
        <div className="mv-ins-t-campo num" data-alvo="">000.000.000-00</div>
        <div className="mv-ins-t-bt">Continuar</div>
      </div>
    );
    case 'senha': return (
      <div className="mv-ins-t-gov">
        <div className="mv-ins-t-govtopo">gov.br</div>
        <b>Digite sua senha</b>
        <small className="num">CPF 000.000.000-00</small>
        <div className="mv-ins-t-campo" data-alvo="">••••••••</div>
        <span className="mv-ins-t-link">Esqueci minha senha</span>
        <div className="mv-ins-t-bt">Entrar</div>
      </div>
    );
    case 'busca': return (
      <div className="mv-ins-t-app-inss">
        <TopoInss titulo="Meu INSS" sub="Olá, Lúcia" />
        <div className="mv-ins-t-busca" data-alvo="">Do que você precisa?</div>
        <div className="mv-ins-t-cards">
          {['Agendamentos', 'Consultar Pedidos', 'Meus Benefícios', 'Declaração de Imposto de Renda'].map((c) => <div key={c}><i />{c}</div>)}
        </div>
      </div>
    );
    case 'resultado': {
      const outros = d.id === 'cons' ? [DOC_APP.pag] : d.id === 'pag' ? [DOC_APP.cons] : [];
      return (
        <div className="mv-ins-t-app-inss">
          <TopoInss titulo="Meu INSS" sub="Olá, Lúcia" />
          <div className="mv-ins-t-busca" data-digitado="">{d.busca}<i aria-hidden /></div>
          <span className="mv-ins-t-rot">Resultados</span>
          <div className="mv-ins-t-res" data-alvo=""><b>{d.nome}</b>{d.tambem && <small>{d.tambem}</small>}</div>
          {outros.map((o) => <div key={o.id} className="mv-ins-t-res" data-apagado=""><b>{o.nome}</b>{o.tambem && <small>{o.tambem}</small>}</div>)}
        </div>
      );
    }
    case 'periodo': return (
      <div className="mv-ins-t-app-inss">
        <TopoInss titulo="Extrato de Pagamento" sub="Histórico de Créditos" />
        <div className="mv-ins-t-form">
          <small>Início do período</small>
          <div className="mv-ins-t-campo num" data-alvo="">{mmaaaa(p.inicio)}</div>
          <small>Fim do período</small>
          <div className="mv-ins-t-campo num" data-alvo="">{mmaaaa(p.fim)}</div>
          <div className="mv-ins-t-bt">Consultar</div>
        </div>
      </div>
    );
    case 'pdf': return (
      <div className="mv-ins-t-pdf">
        <div className="mv-ins-t-pdftopo">{d.arquivo}</div>
        <div className="mv-ins-t-folha">
          <b>{d.nome}</b>
          <small>LÚCIA MARIA DOS SANTOS</small>
          {d.id === 'pag' && <small className="num">{mmaaaa(p.inicio)} a {mmaaaa(p.fim)}</small>}
          <div className="mv-ins-t-tracos" aria-hidden><i /><i /><i /><i /><i /><i /></div>
        </div>
        <div className="mv-ins-t-acoes">
          <span data-alvo="">Baixar</span>
          <span>Compartilhar</span>
        </div>
      </div>
    );
    default: return (
      <div className="mv-ins-t-pdf" data-fundo="">
        <div className="mv-ins-t-pdftopo">{d.arquivo}</div>
        <div className="mv-ins-t-folha"><b>{d.nome}</b><div className="mv-ins-t-tracos" aria-hidden><i /><i /><i /></div></div>
        <div className="mv-ins-t-folhinha">
          <b>Compartilhar</b>
          <div className="mv-ins-t-opcoes">
            <span data-alvo=""><i data-cor="zap" />WhatsApp</span>
            <span><i data-cor="azul-claro" />E-mail</span>
            <span><i data-cor="cinza" />Salvar</span>
          </div>
          <div className="mv-ins-t-contato" data-alvo=""><i />CAF · conversa do atendimento</div>
        </div>
      </div>
    );
  }
}

export function PassoAPassoApp() {
  const p = periodosDoExtrato(hojeMesAno(), 1)[0];
  const [doc, setDoc] = useState<DocId>('pag');
  const [i, setI] = useState(0);
  const passosDe = (dd: DocId): PassoId[] =>
    ['abrir', 'entrar', 'cpf', 'senha', 'busca', 'resultado', ...(dd === 'pag' ? ['periodo' as const] : []), 'pdf', 'enviar'];
  const passos = passosDe(doc);
  const atual = passos[Math.min(i, passos.length - 1)];
  const d = DOC_APP[doc];
  const tx = textoDoPasso(atual, d, p);
  const n = passos.indexOf(atual);

  function trocarDoc(novo: DocId) {
    const novos = passosDe(novo);
    const k = novos.indexOf(atual);
    setDoc(novo);
    setI(k >= 0 ? k : Math.min(n, novos.length - 1));
  }

  return (
    <Figura legenda="O caminho no aplicativo, tela por tela. As telas são ilustrações: a aparência real muda com as atualizações, mas o caminho é o mesmo.">
      <div className="mv-ins-cq"><div className="mv-ins-pp">
        <div className="mv-ins-fone" aria-hidden>
          <div className="mv-ins-fone-tela" data-escuro={atual === 'abrir' ? '' : undefined}>
            <div className="mv-ins-fone-st"><span className="num">10:24</span><span className="mv-ins-fone-bat" /></div>
            <TelaApp id={atual} d={d} p={p} />
          </div>
        </div>
        <div className="mv-ins-pp-lado">
          <div className="mv-ins-seg" role="group" aria-label="Qual documento">
            {(Object.keys(DOC_APP) as DocId[]).map((k) => (
              <button key={k} type="button" aria-pressed={doc === k} onClick={() => trocarDoc(k)}>{DOC_APP[k].curto}</button>
            ))}
          </div>
          <div className="mv-ins-pp-barra">
            <span className="mv-ins-pp-n num">Passo {n + 1} de {passos.length}</span>
            <div className="mv-ins-pp-nav">
              <button type="button" className="mv-ins-bt" disabled={n === 0} onClick={() => setI(n - 1)}>Anterior</button>
              <button type="button" className="mv-ins-bt" data-tom="azul" disabled={n === passos.length - 1} onClick={() => setI(n + 1)}>Próximo</button>
            </div>
          </div>
          <ol className="mv-ins-pp-pontos" aria-label="Ir para o passo">
            {passos.map((pid, k) => (
              <li key={pid}>
                <button type="button" aria-current={k === n ? 'step' : undefined}
                  aria-label={`Passo ${k + 1}: ${textoDoPasso(pid, d, p).titulo}`} onClick={() => setI(k)} />
              </li>
            ))}
          </ol>
          <b className="mv-ins-pp-tit" aria-live="polite">{tx.titulo}</b>
          <div className="mv-ins-pp-bloco"><small>O que fazer</small><div>{tx.faz}</div></div>
          <div className="mv-ins-pp-bloco" data-tom="ambar"><small>Atenção</small><div>{tx.atencao}</div></div>
        </div>
      </div></div>
    </Figura>
  );
}

/* ===================================================================== 4. a janela de 12 meses */
export function JanelaDozeMeses() {
  const hoje = hojeMesAno();
  const [mes, setMes] = useState(hoje.mes);
  const ano = hoje.ano;
  const p = periodosDoExtrato({ mes, ano }, 1)[0];
  const ini = idx(p.inicio);
  const fim = idx(p.fim);
  const doAnoPassado = 12 - mes;
  return (
    <Figura tag="Interativo" legenda="A janela de 12 meses do primeiro período. Escolha o mês em que estamos e conte os quadrinhos azuis: são sempre 12, e o último é o mês de hoje.">
      <div className="mv-ins-cq"><div className="mv-ins-jd">
        <div className="mv-ins-jd-esc">
          <span>Mês em que estamos ({ano}):</span>
          <div className="mv-ins-jd-chips" role="group" aria-label="Mês em que estamos">
            {MESES_CURTOS.map((m, k) => (
              <button key={m} type="button" aria-pressed={mes === k + 1} onClick={() => setMes(k + 1)}>{m}</button>
            ))}
          </div>
        </div>
        <div className="mv-ins-jd-grade" role="img"
          aria-label={`Janela de ${MESES[p.inicio.mes - 1]} de ${p.inicio.ano} a ${MESES[p.fim.mes - 1]} de ${p.fim.ano}`}>
          {[ano - 1, ano].map((a) => (
            <div key={a} className="mv-ins-jd-lin">
              <span className="mv-ins-jd-ano num">{a}</span>
              {MESES_CURTOS.map((m, k) => {
                const t = a * 12 + k;
                const dentro = t >= ini && t <= fim;
                const ponta = t === ini ? 'inicio' : t === fim ? 'fim' : undefined;
                return (
                  <span key={m} className="mv-ins-jd-cel" data-dentro={dentro ? '' : undefined} data-ponta={ponta}>
                    {m}
                    {ponta && <em>{ponta === 'inicio' ? 'início' : 'fim'}</em>}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mv-ins-jd-res">
          <div><small>Início</small><b className="num">{mmaaaa(p.inicio)}</b></div>
          <div><small>Fim</small><b className="num">{mmaaaa(p.fim)}</b></div>
          <div className="mv-ins-jd-conta">
            {doAnoPassado > 0
              ? <>{doAnoPassado} {doAnoPassado === 1 ? 'mês' : 'meses'} de {ano - 1} + {mes} {mes === 1 ? 'mês' : 'meses'} de {ano} = <b>12 meses</b></>
              : <>Em dezembro a janela cabe inteira em {ano}: janeiro a dezembro = <b>12 meses</b></>}
          </div>
        </div>
      </div></div>
    </Figura>
  );
}

/* ===================================================================== 5. tabela de exemplos (calculada) */
const EXEMPLOS: MesAno[] = [{ mes: 10, ano: 2026 }, { mes: 12, ano: 2026 }, { mes: 1, ano: 2027 }, { mes: 3, ano: 2027 }];
export function TabelaExemplosPeriodos() {
  const f = (p: Periodo) => <span className="num mv-ins-nowrap">{mmaaaa(p.inicio)} a {mmaaaa(p.fim)}</span>;
  const linhas = EXEMPLOS.map((h) => {
    const ps = periodosDoExtrato(h);
    return [<b>{MESES[h.mes - 1]} de {h.ano}</b>, f(ps[0]), f(ps[1]), f(ps[2]), f(ps[9])];
  });
  return <TabelaResponsiva colunas={['Mês em que estamos', 'Ano 1', 'Ano 2', 'Ano 3', 'Ano 10']} linhas={linhas} destaque={1} corte="largo" compacto />;
}

/* ===================================================================== 6. o encaixe dos 10 anos (e os erros) */
type Modo = 'certo' | 'repetiu' | 'pulou' | 'mesAtual';
type Tijolo = { p: Periodo; tipo: 'ok' | 'rep' | 'longo' | 'falta' };
const REF: MesAno = { mes: 10, ano: 2026 };
function tijolosDoModo(m: Modo): Tijolo[] {
  const b = periodosDoExtrato(REF);
  const ok = (p: Periodo): Tijolo => ({ p, tipo: 'ok' });
  if (m === 'repetiu') return [ok(b[0]), ok(b[1]), { p: b[1], tipo: 'rep' }, ...b.slice(2, 9).map(ok), { p: b[9], tipo: 'falta' }];
  if (m === 'pulou') return [ok(b[0]), ok(b[1]), { p: b[2], tipo: 'falta' }, ...b.slice(3).map(ok)];
  if (m === 'mesAtual') return b.map((p) => ({ p: { inicio: { mes: REF.mes, ano: p.fim.ano - 1 }, fim: p.fim }, tipo: 'longo' }));
  return b.map(ok);
}
const MODOS: { id: Modo; t: string }[] = [
  { id: 'certo', t: 'Certo' }, { id: 'repetiu', t: 'Repetiu um ano' }, { id: 'pulou', t: 'Pulou um ano' }, { id: 'mesAtual', t: 'Mês atual no início' },
];
const EXPLICA_MODO: Record<Modo, { tom: 'verde' | 'rubro' | 'ambar'; t: string; d: string }> = {
  certo: { tom: 'verde', t: 'Certo: 10 tijolos encaixados', d: 'Cada arquivo começa logo no mês seguinte ao fim do arquivo mais antigo que ele (o ano 2 termina em 10/2025; o ano 1 começa em 11/2025). Os 120 meses ficam cobertos uma vez só: nada repetido, nada faltando.' },
  repetiu: { tom: 'rubro', t: 'Repetiu um ano', d: 'O período 11/2024 a 10/2025 foi baixado duas vezes. Você conta 10 arquivos, mas só tem 9 anos diferentes: o mais antigo (11/2016 a 10/2017) ficou de fora.' },
  pulou: { tom: 'rubro', t: 'Pulou um ano', d: 'Depois de 11/2024 a 10/2025, o próximo baixado foi 11/2022 a 10/2023. O ano de 11/2023 a 10/2024 sumiu: são 12 meses sem extrato, no meio da história do benefício.' },
  mesAtual: { tom: 'ambar', t: 'Começou no mês atual do ano passado', d: '10/2025 a 10/2026 tem 13 meses, mais do que os 12 que o aplicativo entrega por vez. E, descendo os anos assim, todo outubro aparece em dois arquivos. Se você “consertar” tirando um mês do fim, o mês atual fica de fora.' },
};

const T0 = 2016 * 12 + 6; // jul/2016
const T1 = 2027 * 12 + 1; // fev/2027
const X0 = 216;
const X1 = 744;
const xDe = (t: number) => X0 + ((t - T0) / (T1 - T0)) * (X1 - X0);
const Y0 = 42;
const LH = 22;
const CY = Y0 + 11 * LH + 10;
const JAN_INI = idx({ mes: 11, ano: 2016 });
const JAN_FIM = idx({ mes: 10, ano: 2026 });

/* versão estreita (coluna de celular): rótulo em cima, barra embaixo, letra maior */
const NX0 = 14;
const NX1 = 286;
const nxDe = (t: number) => NX0 + ((t - T0) / (T1 - T0)) * (NX1 - NX0);
const NY0 = 34;
const NLH = 34;

export function EncaixeDosAnos() {
  const [modo, setModo] = useState<Modo>('certo');
  const tijolos = tijolosDoModo(modo);
  const ex = EXPLICA_MODO[modo];
  const reais = tijolos.filter((t) => t.tipo !== 'falta');
  const meses = Array.from({ length: JAN_FIM - JAN_INI + 1 }, (_, k) => {
    const t = JAN_INI + k;
    const n = Math.min(reais.filter((r) => idx(r.p.inicio) <= t && t <= idx(r.p.fim)).length, 2);
    return { t, n };
  });
  const trechos: { t0: number; t1: number; n: number }[] = [];
  for (const m of meses) {
    const ult = trechos[trechos.length - 1];
    if (ult && ult.n === m.n && ult.t1 === m.t - 1) ult.t1 = m.t; else trechos.push({ t0: m.t, t1: m.t, n: m.n });
  }
  let arquivo = 0;
  const linhas = tijolos.map((tj, k) => {
    if (tj.tipo !== 'falta') arquivo += 1;
    const per = `${mmaaaa(tj.p.inicio)} a ${mmaaaa(tj.p.fim)}`;
    const rotulo = tj.tipo === 'falta' ? `faltou ${per}` : `${arquivo}. ${per}`;
    const nota = tj.tipo === 'rep' ? 'repetido' : tj.tipo === 'longo' && k === 0 ? '13 meses' : '';
    return { tj, k, rotulo, nota };
  });
  const NCY = NY0 + linhas.length * NLH + 14;
  const rotuloSvg = `${ex.t}. ${ex.d}`;
  return (
    <Figura tag="Interativo" legenda="Cada barra é um arquivo baixado, no exemplo de outubro de 2026. A faixa de baixo mostra os 10 anos pedidos na documentação: verde coberto uma vez, âmbar repetido, vermelho faltando.">
      <div className="mv-ins-cq"><div className="mv-ins-enc">
        <div className="mv-ins-seg" role="group" aria-label="Ver o encaixe">
          {MODOS.map((m) => (
            <button key={m.id} type="button" aria-pressed={modo === m.id} onClick={() => setModo(m.id)}>{m.t}</button>
          ))}
        </div>
        <svg className="mv-ins-enc-largo" viewBox={`0 0 760 ${CY + 62}`} role="img" aria-label={rotuloSvg}>
          <defs>
            <pattern id="mv-ins-hachura" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect className="mv-ins-enc-hf" width="6" height="6" />
              <line className="mv-ins-enc-hl" x1="0" y1="0" x2="0" y2="6" />
            </pattern>
          </defs>
          {Array.from({ length: 10 }, (_, k) => 2017 + k).map((a) => {
            const x = xDe(a * 12);
            return (
              <g key={a}>
                <line className="mv-ins-enc-grade" x1={x} y1={28} x2={x} y2={CY + 18} />
                <text className="mv-ins-enc-ano" x={x} y={20} textAnchor="middle">{a}</text>
              </g>
            );
          })}
          {linhas.map(({ tj, k, rotulo, nota }) => {
            const y = Y0 + k * LH;
            const x = xDe(idx(tj.p.inicio));
            const w = xDe(idx(tj.p.fim) + 1) - x;
            return (
              <g key={k} className="mv-ins-enc-tj" data-tipo={tj.tipo}>
                <text className="mv-ins-enc-rot" x={12} y={y + 12}>{rotulo}</text>
                <rect x={x + 0.5} y={y + 1} width={Math.max(w - 1, 1)} height={14} rx={3} />
                {tj.tipo === 'rep' && <text className="mv-ins-enc-nota" x={x + w + 6} y={y + 12}>{nota}</text>}
                {tj.tipo === 'longo' && nota && <text className="mv-ins-enc-nota" x={x - 6} y={y + 12} textAnchor="end">{nota}</text>}
              </g>
            );
          })}
          <text className="mv-ins-enc-rot" data-forte="" x={12} y={CY + 13}>Os 10 anos pedidos</text>
          {trechos.map((tr) => (
            <rect key={tr.t0} className="mv-ins-enc-cob" data-n={String(tr.n)}
              x={xDe(tr.t0)} y={CY} width={xDe(tr.t1 + 1) - xDe(tr.t0)} height={18} />
          ))}
          <g className="mv-ins-enc-leg">
            <rect className="mv-ins-enc-cob" data-n="1" x={216} y={CY + 36} width={14} height={12} rx={2} />
            <text x={236} y={CY + 46}>coberto uma vez</text>
            <rect className="mv-ins-enc-cob" data-n="2" x={360} y={CY + 36} width={14} height={12} rx={2} />
            <text x={380} y={CY + 46}>repetido</text>
            <rect className="mv-ins-enc-cob" data-n="0" x={466} y={CY + 36} width={14} height={12} rx={2} />
            <text x={486} y={CY + 46}>faltando</text>
          </g>
        </svg>
        <svg className="mv-ins-enc-estreito" viewBox={`0 0 300 ${NCY + 74}`} role="img" aria-label={rotuloSvg}>
          <defs>
            <pattern id="mv-ins-hachura-e" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect className="mv-ins-enc-hf" width="6" height="6" />
              <line className="mv-ins-enc-hl" x1="0" y1="0" x2="0" y2="6" />
            </pattern>
          </defs>
          {Array.from({ length: 10 }, (_, k) => 2017 + k).map((a) => {
            const x = nxDe(a * 12);
            return (
              <g key={a}>
                <line className="mv-ins-enc-grade" x1={x} y1={20} x2={x} y2={26} />
                {/* régua só na faixa das barras, para não cruzar o texto */}
                {linhas.map(({ k }) => <line key={k} className="mv-ins-enc-grade" x1={x} y1={NY0 + k * NLH + 13} x2={x} y2={NY0 + k * NLH + 28} />)}
                <line className="mv-ins-enc-grade" x1={x} y1={NCY + 4} x2={x} y2={NCY + 22} />
                {a % 2 === 1 && <text className="mv-ins-enc-ano" x={x} y={14} textAnchor="middle">{a}</text>}
              </g>
            );
          })}
          {linhas.map(({ tj, k, rotulo, nota }) => {
            const y = NY0 + k * NLH;
            const x = nxDe(idx(tj.p.inicio));
            const w = nxDe(idx(tj.p.fim) + 1) - x;
            return (
              <g key={k} className="mv-ins-enc-tj" data-tipo={tj.tipo}>
                <text className="mv-ins-enc-rot" x={NX0} y={y + 10}>{rotulo}</text>
                {nota && <text className="mv-ins-enc-nota" x={NX1} y={y + 10} textAnchor="end">{nota}</text>}
                <rect x={x + 0.5} y={y + 15} width={Math.max(w - 1, 1)} height={11} rx={3} />
              </g>
            );
          })}
          <text className="mv-ins-enc-rot" data-forte="" x={NX0} y={NCY}>Os 10 anos pedidos</text>
          {trechos.map((tr) => (
            <rect key={tr.t0} className="mv-ins-enc-cob" data-n={String(tr.n)}
              x={nxDe(tr.t0)} y={NCY + 6} width={nxDe(tr.t1 + 1) - nxDe(tr.t0)} height={14} />
          ))}
          <g className="mv-ins-enc-leg">
            <rect className="mv-ins-enc-cob" data-n="1" x={NX0} y={NCY + 36} width={14} height={12} rx={2} />
            <text x={NX0 + 20} y={NCY + 46}>coberto uma vez</text>
            <rect className="mv-ins-enc-cob" data-n="2" x={170} y={NCY + 36} width={14} height={12} rx={2} />
            <text x={190} y={NCY + 46}>repetido</text>
            <rect className="mv-ins-enc-cob" data-n="0" x={NX0} y={NCY + 58} width={14} height={12} rx={2} />
            <text x={NX0 + 20} y={NCY + 68}>faltando</text>
          </g>
        </svg>
        <div className="mv-ins-enc-tx" data-tom={ex.tom} role="status"><b>{ex.t}.</b> {ex.d}</div>
      </div></div>
    </Figura>
  );
}

/* ===================================================================== 7. a vida da senha */
const VIDA: { t: string; d: string; ic: ReactNode; tom: string }[] = [
  { t: 'Oferecer ajuda primeiro', d: '“Quer que eu te guie passo a passo?” A senha é escolha do cliente, nunca exigência.', ic: <IcBalao />, tom: 'azul' },
  { t: 'Receber com cuidado', d: 'Se ele preferir passar, agradeça a confiança e diga para que vai usar: só para buscar os documentos.', ic: <IcChave />, tom: 'azul' },
  { t: 'Usar só para isso', d: 'Entrar, baixar, conferir. Nada de mudar dados, fazer pedidos ou abrir outros serviços.', ic: <IcDoc />, tom: 'ambar' },
  { t: 'Não guardar', d: 'Nada de papel, planilha, bloco de notas, grupo ou senha salva no navegador. Não passe para ninguém.', ic: <IcCadeado />, tom: 'ambar' },
  { t: 'Sair e trocar', d: 'Ao terminar, saia da conta e ajude o cliente a criar uma senha nova, que só ele saiba.', ic: <IcTroca />, tom: 'verde' },
];
export function VidaDaSenha() {
  return (
    <Figura tag="Diagrama" legenda="O caminho da senha do cliente, do começo ao fim. Nenhuma etapa pode ser pulada.">
      <div className="mv-ins-cq"><ol className="mv-ins-vs">
        {VIDA.map((v, k) => (
          <li key={v.t} className="mv-ins-vs-it" data-tom={v.tom}>
            <span className="mv-ins-vs-ic" aria-hidden>{v.ic}</span>
            <span className="mv-ins-vs-n num">{k + 1}</span>
            <b>{v.t}</b>
            <span className="mv-ins-vs-d">{v.d}</span>
          </li>
        ))}
      </ol></div>
    </Figura>
  );
}

/* ===================================================================== 8. o caminho de cada cliente (árvore clicável) */
type NoPergunta = { tipo: 'pergunta'; q: string; ops: { t: string; vai: string }[] };
type NoFim = { tipo: 'fim'; tom: 'verde' | 'azul' | 'ambar'; t: string; d: string };
const NOS: Record<string, NoPergunta | NoFim> = {
  inicio: {
    tipo: 'pergunta', q: 'O cliente consegue entrar no Meu INSS?', ops: [
      { t: 'Sim, ele mexe bem no celular', vai: 'sozinho' },
      { t: 'Tem a senha do gov.br, mas não sabe mexer', vai: 'naoSabe' },
      { t: 'Não lembra a senha do gov.br', vai: 'esqueceu' },
      { t: 'Nunca criou a conta gov.br', vai: 'semConta' },
      { t: 'Quem mexe no celular é um filho ou neto', vai: 'familia' },
    ],
  },
  naoSabe: {
    tipo: 'pergunta', q: 'Ofereça guiar passo a passo. O que ele prefere?', ops: [
      { t: 'Tentar com a minha ajuda', vai: 'guiar' },
      { t: 'Passar a senha para você pegar os documentos', vai: 'senha' },
    ],
  },
  sozinho: { tipo: 'fim', tom: 'verde', t: 'Peça um documento de cada vez', d: 'Mande o nome exato de cada documento e, para o extrato de pagamento, as datas de cada período. Confira cada PDF que chegar.' },
  guiar: { tipo: 'fim', tom: 'azul', t: 'Guie por mensagem ou áudio', d: 'Um passo por mensagem, esperando ele confirmar. Travou? Peça um print da tela. Use o roteiro e as mensagens prontas desta lição.' },
  senha: { tipo: 'fim', tom: 'ambar', t: 'Siga o procedimento da senha (seção 7)', d: 'Use só para buscar os documentos, não guarde em lugar nenhum, saia da conta ao terminar e ajude o cliente a trocar a senha depois.' },
  esqueceu: { tipo: 'fim', tom: 'ambar', t: 'Recuperar a senha no próprio gov.br', d: 'Na tela da senha existe a opção “Esqueci minha senha”. Vá com calma, uma etapa por vez. Se não der certo, fale com o seu gestor.' },
  semConta: { tipo: 'fim', tom: 'ambar', t: 'Criar a conta gov.br com o cliente', d: 'A conta é criada no próprio gov.br, com o CPF. Siga o passo a passo que o gov.br mostra, sem pressa. Se travar, fale com o seu gestor.' },
  familia: { tipo: 'fim', tom: 'azul', t: 'Converse com quem está ajudando', d: 'Guie o filho ou o neto do mesmo jeito. Lembre: o CPF, a senha e os documentos são sempre de quem recebe o benefício (na rota do familiar, do familiar que recebe). Na dúvida, pergunte ao seu gestor.' },
};
export function CaminhoDoCliente() {
  const [trilha, setTrilha] = useState<{ no: string; escolha?: string }[]>([{ no: 'inicio' }]);
  const ultimo = trilha[trilha.length - 1];
  const no = NOS[ultimo.no];
  function escolher(t: string, vai: string) {
    setTrilha((tr) => [...tr.slice(0, -1), { ...tr[tr.length - 1], escolha: t }, { no: vai }]);
  }
  return (
    <Figura tag="Interativo" legenda="Árvore de decisão: responda as perguntas e veja qual caminho seguir com cada tipo de cliente.">
      <div className="mv-ins-cam">
        {trilha.slice(0, -1).map((passo) => {
          const n = NOS[passo.no];
          return n.tipo === 'pergunta' ? (
            <div key={passo.no} className="mv-ins-cam-feito">
              <span>{n.q}</span>
              <b><Ico><IcCheck /></Ico>{passo.escolha}</b>
            </div>
          ) : null;
        })}
        {no.tipo === 'pergunta' ? (
          <div className="mv-ins-cam-q">
            <b>{no.q}</b>
            <div className="mv-ins-cam-ops">
              {no.ops.map((o) => (
                <button key={o.t} type="button" className="mv-ins-bt" onClick={() => escolher(o.t, o.vai)}>{o.t}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mv-ins-cam-fim" data-tom={no.tom} role="status">
            <small>Caminho</small>
            <b>{no.t}</b>
            <span>{no.d}</span>
          </div>
        )}
        {trilha.length > 1 && (
          <button type="button" className="mv-link mv-ins-cam-de-novo" onClick={() => setTrilha([{ no: 'inicio' }])}>Recomeçar</button>
        )}
      </div>
    </Figura>
  );
}

/* ===================================================================== 9. conferir o PDF (exercício) */
const CASOS_PDF: { doc: string; nome: string; per?: string; borrado?: boolean; ok: boolean; porque: string }[] = [
  { doc: 'Extrato de Pagamento de Benefício', nome: 'LÚCIA MARIA DOS SANTOS', per: '11/2025 a 10/2026', ok: true, porque: 'Documento certo, nome certo e o período do ano 1 de outubro de 2026. Pode seguir.' },
  { doc: 'Extrato de Pagamento de Benefício', nome: 'LÚCIA MARIA DOS SANTOS', per: '10/2025 a 09/2026', ok: false, porque: 'Período errado: começou no mês atual do ano passado e terminou no mês passado. Fora da regra, ele desencaixa dos outros anos. O certo é 11/2025 a 10/2026.' },
  { doc: 'Carta de Concessão', nome: 'ANTÔNIO CARLOS DOS SANTOS', ok: false, porque: 'É de outra pessoa da família. A carta tem que ser do titular do benefício que está sendo analisado: a Dona Lúcia.' },
  { doc: 'Extrato de Empréstimo Consignado', nome: 'LÚCIA MARIA DOS SANTOS', borrado: true, ok: false, porque: 'Foto da tela, torta e borrada: não dá para ler os contratos. Peça o PDF baixado pelo próprio aplicativo.' },
  { doc: 'Extrato de Pagamento de Benefício', nome: 'LÚCIA MARIA DOS SANTOS', per: '11/2024 a 10/2025', ok: true, porque: 'É o ano 2 da lista de outubro de 2026, certinho. Marque na calculadora e peça o próximo.' },
];
export function ConfiraOPdf() {
  const [resp, setResp] = useState<Record<number, boolean>>({});
  const feitos = Object.keys(resp).length;
  const acertos = CASOS_PDF.filter((c, k) => resp[k] === c.ok).length;
  return (
    <Figura tag="Exercício" legenda="Exemplo: estamos em outubro de 2026 e a cliente é a Dona Lúcia (Lúcia Maria dos Santos). Aprove o PDF ou peça de novo.">
      <div className="mv-ins-cf">
        {CASOS_PDF.map((c, k) => {
          const r = resp[k];
          const respondeu = r !== undefined;
          return (
            <div key={k} className="mv-ins-cf-it" data-estado={!respondeu ? undefined : r === c.ok ? 'certo' : 'errado'}>
              <div className="mv-ins-mini" data-borrado={c.borrado ? '' : undefined} aria-hidden>
                <div className="mv-ins-mini-folha">
                  <b>{c.doc}</b>
                  <small>{c.nome}</small>
                  {c.per && <small className="num">Período: {c.per}</small>}
                  <i /><i />
                </div>
              </div>
              <div className="mv-ins-cf-tx">
                <span className="mv-ins-cf-tit">Arquivo {k + 1}</span>
                <span className="mv-ins-cf-desc">
                  {c.doc} · {c.nome}{c.per && <> · <span className="num mv-ins-nowrap">{c.per}</span></>}{c.borrado ? ' · foto da tela do computador' : ''}
                </span>
                {!respondeu ? (
                  <div className="mv-ins-cf-bts">
                    <button type="button" className="mv-ins-bt" data-tom="verde" onClick={() => setResp((x) => ({ ...x, [k]: true }))}><Ico><IcCheck /></Ico>Aprovar</button>
                    <button type="button" className="mv-ins-bt" data-tom="rubro" onClick={() => setResp((x) => ({ ...x, [k]: false }))}><Ico><IcX /></Ico>Pedir de novo</button>
                  </div>
                ) : (
                  <span className="mv-ins-cf-r"><b>{r === c.ok ? 'Acertou.' : 'Errou.'}</b> {c.porque}</span>
                )}
              </div>
            </div>
          );
        })}
        {feitos === CASOS_PDF.length && (
          <div className="mv-ins-cf-fim" role="status">
            <b className="num">{acertos} de {CASOS_PDF.length}</b> acertos.
            <button type="button" className="mv-link" onClick={() => setResp({})}>Fazer de novo</button>
          </div>
        )}
      </div>
    </Figura>
  );
}

/* ===================================================================== 10. checklist final */
const GRUPOS_CK: { t: string; itens: string[] }[] = [
  { t: 'Os documentos', itens: ['Carta de concessão (1 PDF)', 'Extrato de Empréstimo Consignado (1 PDF)', 'Extrato de Pagamento de Benefício: 10 PDFs, um por período'] },
  { t: 'A conferência', itens: ['Tudo do titular do benefício (nome e número batem)', 'Os 10 períodos certos: sem repetir e sem pular ano', 'Tudo legível e completo, de preferência em PDF', 'Benefício com menos de 10 anos? Data de início anotada e gestor avisado'] },
  { t: 'A senha (se o cliente passou)', itens: ['Usei só para buscar os documentos', 'Não anotei nem salvei em lugar nenhum', 'Saí da conta ao terminar', 'Ajudei o cliente a trocar a senha'] },
  { t: 'O próximo passo', itens: ['Avisei o cliente do próximo passo sugerido: imposto de renda e CPF, no gov.br'] },
];
const TOTAL_CK = GRUPOS_CK.reduce((s, g) => s + g.itens.length, 0);
export function ChecklistMeuInss() {
  const [feitos, setFeitos] = useState<Set<string>>(() => new Set());
  function alternar(k: string) {
    setFeitos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  return (
    <Figura tag="Checklist" legenda="Marque cada item antes de passar para o gov.br. A marcação é só para você treinar: ela some quando você sai da página.">
      <div className="mv-ins-ck">
        <div className="mv-ins-ck-topo">
          <span className="num">{feitos.size} de {TOTAL_CK} itens</span>
          <div className="mv-ins-ck-barra" aria-hidden><i style={{ width: `${(feitos.size / TOTAL_CK) * 100}%` }} /></div>
          <button type="button" className="mv-link" onClick={() => setFeitos(new Set())}>Limpar</button>
        </div>
        <div className="mv-ins-ck-grade">
          {GRUPOS_CK.map((g) => (
            <div key={g.t} className="mv-ins-ck-grupo">
              <b>{g.t}</b>
              {g.itens.map((it, k) => {
                const chave = `${g.t}-${k}`;
                const on = feitos.has(chave);
                return (
                  <button key={chave} type="button" className="mv-ins-ck-it" aria-pressed={on} onClick={() => alternar(chave)}>
                    <span className="mv-ins-ck-caixa">{on && <Ico><IcCheck /></Ico>}</span>
                    <span>{it}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {feitos.size === TOTAL_CK && (
          <div className="mv-ins-ck-fim" role="status"><Ico><IcCheck /></Ico>Meu INSS completo. Próxima parada sugerida: gov.br.</div>
        )}
      </div>
    </Figura>
  );
}
