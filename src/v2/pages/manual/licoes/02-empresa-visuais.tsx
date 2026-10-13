/* Lição 2 — ilustrações e exercícios próprios (prefixo mv-emp-): as 5
   financeiras, a ideia dos juros abusivos, a janela de 10 anos, os 4 números,
   quem é quem, as etapas do caso, a divisão 70/30, do documento ao valor, a
   margem do benefício, os ganchos e o exercício "verdade ou mito".
   Fatos da empresa: só os do brief do dono (13/10/2026) e do processo oficial. */
import { useState, type ReactNode } from 'react';
import { IcCheck, IcX } from '../pecas';
import { hojeMesAno } from '../ilustracoes';
import { MESES_CURTOS, periodosDoExtrato, type MesAno } from '../periodos';
import './02-empresa.css';

const real = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/* ------------------------------------------------------------ ícones (traço, 24×24) */
function Ic({ children }: { children: ReactNode }) {
  return (
    <svg className="mv-emp-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
  );
}
const IcCalendario = () => <Ic><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" /></Ic>;
const IcAmpulheta = () => <Ic><path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5c0 4.5 4.5 5.5 4.5 8.5s-4.5 4-4.5 8.5M16.5 3.5c0 4.5-4.5 5.5-4.5 8.5s4.5 4 4.5 8.5" /></Ic>;
const IcCarteira = () => <Ic><path d="M4 7.5h14.5A1.5 1.5 0 0120 9v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18V7.5z" /><path d="M4 7.5l11-3.5v3.5M16 13.5h.01" /></Ic>;
const IcPizza = () => <Ic><circle cx="12" cy="12" r="8.5" /><path d="M12 12V3.5A8.5 8.5 0 0120.08 14.63Z" fill="currentColor" fillOpacity=".28" /></Ic>;
const IcPessoa = () => <Ic><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></Ic>;
const IcRobo = () => <Ic><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 5v3M9.5 13h.01M14.5 13h.01M9.5 16.2h5" /><circle cx="12" cy="4" r="1" /></Ic>;
const IcFone = () => <Ic><path d="M4.5 14v-2a7.5 7.5 0 0115 0v2" /><rect x="3.5" y="13" width="4" height="6" rx="1.5" /><rect x="16.5" y="13" width="4" height="6" rx="1.5" /><path d="M18.5 19c0 1.4-1.6 2-4 2h-2" /></Ic>;
const IcBalanca = () => <Ic><path d="M12 4v16M7.5 20h9M5 7.5h14M5 7.5l-2.5 6a2.5 2.5 0 005 0L5 7.5zM19 7.5l-2.5 6a2.5 2.5 0 005 0L19 7.5z" /></Ic>;
const IcDoc = () => <Ic><path d="M7 3.5h7l4 4V20a.5.5 0 01-.5.5h-10.5a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5z" /><path d="M14 3.5V8h4M9 12h6M9 15.5h6" /></Ic>;
const IcLupa = () => <Ic><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></Ic>;
const IcPergunta = () => <Ic><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 014.8.8c0 1.7-2.4 2.1-2.4 3.7M12 16.8v.01" /></Ic>;
const IcSeta = () => <Ic><path d="M5 12h14M13 6l6 6-6 6" /></Ic>;
const IcVolta = () => <Ic><path d="M9 14l-4-4 4-4" /><path d="M5 10h9.5a4.5 4.5 0 010 9H11" /></Ic>;

/* ------------------------------------------------------------ as 5 financeiras */
const FINANCEIRAS = [
  { n: 'Agibank', top: true }, { n: 'Mercantil', top: true }, { n: 'BMG', top: true },
  { n: 'Facta', top: false }, { n: 'Crefisa', top: false },
];
export function CincoFinanceiras() {
  return (
    <div className="mv-emp-fin" role="group" aria-label="As 5 financeiras com que a gente trabalha">
      {FINANCEIRAS.map((f) => (
        <div key={f.n} className="vidro mv-emp-fin-it" data-top={f.top ? '' : undefined}>
          <span className="mv-emp-fin-ini" aria-hidden>{f.n.slice(0, 1)}</span>
          <b>{f.n}</b>
          <small>{f.top ? 'Top 3: as que mais chegam' : 'Também trabalhamos'}</small>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ juros: a ideia (sem valores reais) */
export function JurosSimplificado() {
  return (
    <div className="mv-emp-juros">
      <div className="mv-emp-juros-lin">
        <div className="mv-emp-juros-rot"><b>Parcela com juros normais</b><small>o preço justo do empréstimo</small></div>
        <div className="mv-emp-juros-barra" style={{ width: '80%' }} aria-hidden>
          <i data-p="devolve" style={{ flexGrow: 58 }}>Dinheiro emprestado</i>
          <i data-p="juros" style={{ flexGrow: 22 }}>Juros</i>
        </div>
      </div>
      <div className="mv-emp-juros-lin">
        <div className="mv-emp-juros-rot"><b>Parcela com juros abusivos</b><small>o mesmo empréstimo, cobrado a mais</small></div>
        <div className="mv-emp-juros-barra" style={{ width: '100%' }} aria-hidden>
          <i data-p="devolve" style={{ flexGrow: 58 }}>Dinheiro emprestado</i>
          <i data-p="juros" style={{ flexGrow: 22 }}>Juros</i>
          <i data-p="abuso" style={{ flexGrow: 20 }}>A mais</i>
        </div>
      </div>
      <ul className="mv-emp-leg">
        <li><i data-p="devolve" />Parte que devolve o dinheiro emprestado</li>
        <li><i data-p="juros" />Juros: o “preço” do empréstimo</li>
        <li><i data-p="abuso" />Juros cobrados acima do que deveriam</li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ janela de 10 anos */
const mesCurto = (m: MesAno) => `${MESES_CURTOS[m.mes - 1]}/${String(m.ano).slice(2)}`;
export function JanelaDezAnos() {
  // mais antigo à esquerda, mais recente à direita (cada bloco = 1 extrato de 12 meses)
  const periodos = periodosDoExtrato(hojeMesAno()).slice().reverse();
  return (
    <div className="mv-emp-jan">
      <div className="mv-emp-jan-chave">Últimos 10 anos: o período do pedido de ressarcimento</div>
      <div className="mv-emp-jan-faixa">
        <div className="mv-emp-jan-antes" aria-hidden><span>antes</span><small>fora do pedido</small></div>
        <ol className="mv-emp-jan-anos" aria-label="Os 10 anos do pedido, do mais antigo ao mais recente">
          {periodos.map((p, i) => (
            <li key={i} data-recente={i === periodos.length - 1 ? '' : undefined}>
              <div className="mv-emp-jan-meses" aria-hidden>{Array.from({ length: 12 }, (_, k) => <i key={k} />)}</div>
              <span className="num">{mesCurto(p.inicio)}</span>
              <span className="num">{mesCurto(p.fim)}</span>
            </li>
          ))}
        </ol>
        <div className="mv-emp-jan-hoje" aria-hidden>hoje</div>
      </div>
      <ul className="mv-emp-leg">
        <li><i data-c="mes" />1 tracinho = 1 mês do benefício, com os descontos daquele mês</li>
        <li><i data-c="ano" />1 bloco = 12 meses = 1 extrato de pagamento para baixar</li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ os 4 números (clique para ver) */
type Numero = {
  id: string; tom: 'azul' | 'ambar' | 'verde' | 'neutro'; icone: ReactNode; grande: string; rotulo: string;
  significa: ReactNode; dizer: string; cuidado: ReactNode;
};
const NUMEROS: Numero[] = [
  {
    id: 'anos', tom: 'azul', icone: <IcCalendario />, grande: '10 anos', rotulo: 'de descontos no pedido',
    significa: <>A ação pede o ressarcimento do que foi descontado <b>nos últimos 10 anos</b>. É por isso que a gente busca 10 anos de extratos no Meu INSS.</>,
    dizer: '“O nosso advogado entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise.”',
    cuidado: <>Pedir não é o mesmo que receber. Nunca diga “você vai receber 10 anos de parcelas de volta”: o que volta depende da análise e do processo.</>,
  },
  {
    id: 'prazo', tom: 'ambar', icone: <IcAmpulheta />, grande: '6 a 12', rotulo: 'meses, em média, até o ressarcimento',
    significa: <>É o tempo que o ressarcimento <b>costuma levar</b>. É uma média: cada processo tem o seu ritmo.</>,
    dizer: '“Em média, leva de 6 a 12 meses.”',
    cuidado: <>Não prometa data e não invente prazo para cada etapa. Se o cliente pressionar, repita a média com calma.</>,
  },
  {
    id: 'gratis', tom: 'verde', icone: <IcCarteira />, grande: 'R$ 0', rotulo: 'para começar: o processo é gratuito',
    significa: <>O cliente <b>não paga nada</b> para entrar: nem taxa de abertura, nem parcela durante o processo.</>,
    dizer: '“Para começar, você não paga nada.”',
    cuidado: <>Não diga só “é de graça”. Fale dos 30% junto, desde o começo, para o cliente não se sentir enganado lá na frente.</>,
  },
  {
    id: 'hon', tom: 'neutro', icone: <IcPizza />, grande: '30%', rotulo: 'no final, para o advogado',
    significa: <>São os <b>honorários</b> do advogado. Percentual fixo, cobrado só no final e retirado do valor que o cliente receber.</>,
    dizer: '“No final, do valor que você receber, 30% ficam para o advogado. De cada R$\u00a010, R$\u00a07 são seus.”',
    cuidado: <>É 30% do valor <b>recebido</b>, não do empréstimo nem das parcelas. E nunca é cobrado antes.</>,
  },
];
export function QuatroNumeros() {
  const [sel, setSel] = useState(0);
  const n = NUMEROS[sel];
  return (
    <div className="mv-emp-num">
      <div className="mv-emp-num-grade" role="tablist" aria-label="Os 4 números do processo">
        {NUMEROS.map((x, i) => (
          <button key={x.id} id={`mv-emp-num-${x.id}`} type="button" role="tab" aria-selected={sel === i}
            aria-controls="mv-emp-num-painel" className="vidro mv-emp-num-it" data-tom={x.tom} onClick={() => setSel(i)}>
            <span className="mv-emp-num-ic">{x.icone}</span>
            <b className="num">{x.grande}</b>
            <span>{x.rotulo}</span>
          </button>
        ))}
      </div>
      <div className="vidro mv-emp-num-painel" role="tabpanel" id="mv-emp-num-painel" aria-labelledby={`mv-emp-num-${n.id}`}>
        <div><span className="mv-emp-rotulo">O que significa</span><span className="mv-emp-num-tx">{n.significa}</span></div>
        <div><span className="mv-emp-rotulo">Como dizer ao cliente</span><span className="mv-emp-fala">{n.dizer}</span></div>
        <div><span className="mv-emp-rotulo">Cuidado</span><span className="mv-emp-cuidado">{n.cuidado}</span></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ quem é quem */
const PAPEIS: { id: string; ic: ReactNode; ordem: string; nome: string; papel: string; faz: string[]; nunca?: string }[] = [
  {
    id: 'cliente', ic: <IcPessoa />, ordem: 'Começa aqui', nome: 'O cliente', papel: 'Recebe benefício do INSS',
    faz: ['Vê o anúncio no Facebook e chama no WhatsApp', 'Manda os documentos, com a sua ajuda', 'Assina as procurações pelo gov.br'],
  },
  {
    id: 'robo', ic: <IcRobo />, ordem: 'Primeiro contato', nome: 'O robô', papel: 'Mensagens automáticas',
    faz: ['Dá as boas-vindas', 'Pergunta se a pessoa quer a análise', 'Pega o nome completo e o CPF'],
  },
  {
    id: 'voce', ic: <IcFone />, ordem: 'Assume a conversa', nome: 'Você', papel: 'Atendente',
    faz: ['Explica o processo e tira as dúvidas', 'Junta a documentação, passo a passo', 'Cadastra o cliente e ajuda na assinatura das procurações'],
    nunca: 'prometer valor ou dar opinião jurídica.',
  },
  {
    id: 'adv', ic: <IcBalanca />, ordem: 'Entra com a ação', nome: 'Dr. Rafael Menezes', papel: 'Nosso advogado',
    faz: ['Entra com a ação na Justiça', 'Pede o ressarcimento dos últimos 10 anos', 'Recebe os 30% de honorários, só no final'],
  },
];
export function QuemEQuem() {
  return (
    <div className="mv-emp-qq">
      <ol className="mv-emp-qq-fila">
        {PAPEIS.map((p, i) => (
          <li key={p.id} className="mv-emp-qq-it">
            <div className="vidro mv-emp-qq-card" data-papel={p.id}>
              <span className="mv-emp-rotulo num">{i + 1}. {p.ordem}</span>
              <span className="mv-emp-qq-av" aria-hidden>{p.ic}</span>
              <b>{p.nome}</b>
              <small>{p.papel}</small>
              <ul>{p.faz.map((f) => <li key={f}><IcCheck /><span>{f}</span></li>)}</ul>
              {p.nunca && <div className="mv-emp-qq-nunca"><IcX /><span><b>Nunca:</b> {p.nunca}</span></div>}
            </div>
            {i < PAPEIS.length - 1 && <span className="mv-emp-qq-seta" aria-hidden><IcSeta /></span>}
          </li>
        ))}
      </ol>
      <div className="mv-emp-qq-volta">
        <span aria-hidden><IcVolta /></span>
        <span>No final, o ressarcimento volta para o cliente: <b>70% ficam com ele</b> e 30% são os honorários do advogado.</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ etapas do caso (clique em cada uma) */
type Fase = 'voce' | 'adv' | 'cliente';
const NOME_FASE: Record<Fase, string> = { voce: 'com você', adv: 'com o advogado', cliente: 'com o cliente' };
const ETAPAS: { t: string; curto: string; fase: Fase; quem: string; acontece: ReactNode; dizer: string }[] = [
  {
    t: 'Documentos', curto: 'Documentos', fase: 'voce', quem: 'Você e o cliente',
    acontece: <>Você junta a documentação: no <b>Meu INSS</b> (carta de concessão, extrato de empréstimo consignado e os extratos de pagamento de 10 anos), no <b>gov.br</b> (imposto de renda dos últimos 3 anos), no site da <b>Receita</b> (situação cadastral do CPF) e os <b>documentos pessoais</b> (identidade, comprovante de residência do mês atual ou do mês passado e o e-mail). Essa é a ordem sugerida, não uma regra: o cliente pode mandar primeiro o que tiver. A maioria não sabe entrar no Meu INSS: você ajuda em tudo.</>,
    dizer: '“Vou te ajudar a pegar cada documento, um de cada vez. É mais fácil do que parece.”',
  },
  {
    t: 'Cadastro do cliente', curto: 'Cadastro', fase: 'voce', quem: 'Você',
    acontece: <>Com a documentação completa, o cliente é cadastrado no <b>sistema admin</b>. É o cadastro que gera as procurações. O passo a passo fica para a lição “Cadastro, procurações e assinatura”.</>,
    dizer: '“Recebi tudo, muito obrigado! Agora vou cadastrar o seu caso.”',
  },
  {
    t: 'Procurações assinadas', curto: 'Procurações', fase: 'voce', quem: 'O cliente, com a sua ajuda',
    acontece: <>O cliente assina as procurações <b>digitalmente, pelo gov.br</b>. Para assinar, a conta gov.br precisa estar no nível <b>prata ou ouro</b> (bronze não assina). A procuração é o documento que autoriza o advogado a agir em nome do cliente: sem ela, a ação não sai.</>,
    dizer: '“Agora falta só a sua assinatura, pelo gov.br. Eu te explico o passo a passo.”',
  },
  {
    t: 'O advogado entra com a ação', curto: 'Ação', fase: 'adv', quem: 'Dr. Rafael Menezes',
    acontece: <>Com tudo assinado, o nosso advogado entra com uma <b>ação na Justiça</b> pedindo o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise.</>,
    dizer: '“O seu caso foi para o nosso advogado, o Dr. Rafael Menezes, que entra com a ação.”',
  },
  {
    t: 'Acompanhamento', curto: 'Andamento', fase: 'adv', quem: 'O processo corre na Justiça',
    acontece: <>O processo segue o ritmo da Justiça e <b>não tem prazo certo para cada fase</b>. Como e por quem o cliente recebe notícias do andamento: siga a orientação do seu gestor. Não invente previsões.</>,
    dizer: '“Cada processo tem o seu ritmo. Em média, leva de 6 a 12 meses até o ressarcimento.”',
  },
  {
    t: 'Ressarcimento', curto: 'Ressarcimento', fase: 'cliente', quem: 'O cliente recebe',
    acontece: <>Quando o processo termina com ressarcimento, o cliente recebe o valor. Os <b>30% de honorários</b> são retirados desse valor e <b>70% ficam com o cliente</b>. É o único momento em que existe cobrança.</>,
    dizer: '“Do valor que você receber, 70% ficam com você e 30% com o advogado.”',
  },
];
export function EtapasDoCaso() {
  const [sel, setSel] = useState(0);
  const e = ETAPAS[sel];
  return (
    <div className="mv-emp-et">
      <div className="mv-emp-et-fases" aria-hidden>
        <span data-fase="voce" style={{ gridColumn: '1 / 4' }}>Com você (atendimento)</span>
        <span data-fase="adv" style={{ gridColumn: '4 / 6' }}>Com o advogado</span>
        <span data-fase="cliente" style={{ gridColumn: '6 / 7' }}>Cliente recebe</span>
      </div>
      <ol className="mv-emp-et-trilho" aria-label="As 6 etapas do caso">
        {ETAPAS.map((x, i) => (
          <li key={x.t}>
            <button type="button" data-fase={x.fase} aria-pressed={sel === i} onClick={() => setSel(i)}>
              <span className="mv-emp-et-n num">{i + 1}</span>
              <span className="mv-emp-et-t">{x.curto}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="mv-emp-et-prazo" aria-hidden>
        <div><i /><span>em média, 6 a 12 meses até o ressarcimento</span></div>
      </div>
      <div className="vidro mv-emp-et-painel" data-fase={e.fase} aria-live="polite">
        <div className="mv-emp-et-cab">
          <div>
            <small className="num">Etapa {sel + 1} de {ETAPAS.length} · {NOME_FASE[e.fase]}</small>
            <h4>{e.t}</h4>
          </div>
          <span className="mv-emp-et-quem">{e.quem}</span>
        </div>
        <div className="mv-emp-et-cols">
          <div><span className="mv-emp-rotulo">O que acontece</span><span className="mv-emp-et-tx">{e.acontece}</span></div>
          <div><span className="mv-emp-rotulo">Sugestão de frase</span><span className="mv-emp-fala">{e.dizer}</span></div>
        </div>
        <div className="mv-emp-et-pe">
          <button type="button" className="mv-emp-bt" disabled={sel === 0} onClick={() => setSel(sel - 1)}>Anterior</button>
          <span className="num">{sel + 1} / {ETAPAS.length}</span>
          <button type="button" className="mv-emp-bt" disabled={sel === ETAPAS.length - 1} onClick={() => setSel(sel + 1)}>Próxima etapa</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ divisão 70/30 (rosca + moedas) */
const EXEMPLOS = [5000, 10000, 20000];
export function Divisao7030() {
  const [v, setV] = useState(10000);
  const adv = Math.round(v * 0.3);
  const cli = v - adv;
  const R = 80;
  const C = 2 * Math.PI * R;
  const folga = 4; // espacinho entre as duas fatias
  return (
    <div className="mv-emp-div">
      <svg className="mv-emp-rosca" viewBox="0 0 200 200" role="img"
        aria-label={`Exemplo: de ${real(v)} recebidos, ${real(cli)} ficam com o cliente (70%) e ${real(adv)} são os honorários do advogado (30%).`}>
        <circle className="mv-emp-rosca-trilho" cx="100" cy="100" r={R} />
        <circle className="mv-emp-rosca-cli" cx="100" cy="100" r={R} strokeDasharray={`${C * 0.7 - folga} ${C}`} transform="rotate(-90 100 100)" />
        <circle className="mv-emp-rosca-adv" cx="100" cy="100" r={R} strokeDasharray={`${C * 0.3 - folga} ${C}`}
          strokeDashoffset={-C * 0.7} transform="rotate(-90 100 100)" />
        <text className="mv-emp-rosca-v" x="100" y="97" textAnchor="middle">{real(v)}</text>
        <text className="mv-emp-rosca-s" x="100" y="118" textAnchor="middle">valor recebido</text>
      </svg>
      <div className="mv-emp-div-lado">
        <div className="mv-emp-div-chips" role="group" aria-label="Escolha um valor de exemplo">
          <span>Exemplo:</span>
          {EXEMPLOS.map((x) => (
            <button key={x} type="button" className="num" aria-pressed={v === x} onClick={() => setV(x)}>{real(x)}</button>
          ))}
        </div>
        <dl className="mv-emp-div-leg">
          <div data-c="cli"><dt><i />Fica com o cliente · 70%</dt><dd className="num">{real(cli)}</dd></div>
          <div data-c="adv"><dt><i />Honorários do advogado · 30%</dt><dd className="num">{real(adv)}</dd></div>
        </dl>
        <div className="mv-emp-moedas">
          <div role="img" aria-label="De cada 10 reais, 7 ficam com o cliente e 3 com o advogado">
            <span data-g="cli" aria-hidden>{Array.from({ length: 7 }, (_, i) => <i key={i} data-c="cli">R$ 1</i>)}</span>
            <span data-g="adv" aria-hidden>{Array.from({ length: 3 }, (_, i) => <i key={i} data-c="adv">R$ 1</i>)}</span>
          </div>
          <small>De cada <b>R$&nbsp;10</b> que o cliente receber, <b>R$&nbsp;7</b> ficam com ele e <b>R$&nbsp;3</b> com o advogado.</small>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ do documento ao valor */
const CAMINHO = [
  { ic: <IcDoc />, t: 'Extratos', d: '10 anos de descontos no benefício' },
  { ic: <IcLupa />, t: 'Análise', d: 'Quais empréstimos, quanto foi descontado e por quanto tempo' },
  { ic: <IcBalanca />, t: 'Processo', d: 'O advogado pede o ressarcimento na Justiça' },
  { ic: <IcPergunta />, t: 'O valor', d: 'Só aparece no fim desse caminho' },
];
export function DoDocumentoAoValor() {
  return (
    <div className="mv-emp-cam">
      <ol aria-label="Do documento ao valor: extratos, análise, processo e, por último, o valor">
        {CAMINHO.map((c, i) => (
          <li key={c.t} data-ultimo={i === CAMINHO.length - 1 ? '' : undefined}>
            {i === 0 && <span className="mv-emp-cam-pin">Você está aqui</span>}
            <span className="mv-emp-cam-ic" aria-hidden>{c.ic}</span>
            <b>{c.t}</b>
            <span>{c.d}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------ margem do benefício (conhecimento público) */
const MARGENS = [
  { t: 'Com margem livre', s: 'ainda cabe um empréstimo novo', usado: 20, livre: 15 },
  { t: 'Sem margem', s: 'a situação da maioria no canal de empréstimo', usado: 35, livre: 0 },
];
export function MargemBeneficio() {
  return (
    <div className="mv-emp-mg">
      <div className="mv-emp-mg-topo">
        <span aria-hidden />
        <div className="mv-emp-mg-chave">Margem<span className="mv-emp-mg-longo"> consignável:</span> até 45%</div>
      </div>
      {MARGENS.map((l) => (
        <div key={l.t} className="mv-emp-mg-lin">
          <div className="mv-emp-mg-rot"><b>{l.t}</b><small>{l.s}</small></div>
          <div className="mv-emp-mg-barra" aria-hidden>
            <i data-p="usado" style={{ flexGrow: l.usado }}>{l.livre ? 'Usada' : 'Toda usada'}</i>
            {l.livre > 0 && <i data-p="livre" style={{ flexGrow: l.livre }}>Livre</i>}
            <i data-p="cartao" style={{ flexGrow: 10 }} title="Cartões consignados: 5% + 5%">5+5</i>
            <i data-p="resto" style={{ flexGrow: 55 }}>Resto do benefício</i>
          </div>
        </div>
      ))}
      <ul className="mv-emp-leg">
        <li><i data-p="usado" />Margem já usada pelas parcelas de empréstimo (até 35%)</li>
        <li><i data-p="livre" />Margem livre para empréstimo novo</li>
        <li><i data-p="cartao" />Cartões consignados: 5% + 5%</li>
        <li><i data-p="resto" />Resto do benefício</li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ ganchos até o processo */
const GANCHOS = [
  { t: 'A verdade sobre a margem', d: 'Explicar, com calma, que hoje não há margem para um empréstimo novo, e por quê.' },
  { t: 'Aumento de margem', d: 'Ver a possibilidade de aumentar a margem do cliente.' },
  { t: 'Portabilidade', d: 'Ver a possibilidade de levar os consignados para outro banco, o que pode liberar um valor acima de R$\u00a01.500.' },
];
export function GanchosAteOProcesso() {
  return (
    <div className="mv-emp-gan" role="group" aria-label="Do pedido de empréstimo até o processo: os ganchos">
      <div className="mv-emp-gan-ini">
        <div className="vidro mv-emp-gan-no"><span className="mv-emp-rotulo">O cliente chega</span><b>“Quero um empréstimo, preciso de dinheiro rápido”</b></div>
        <span className="mv-emp-gan-seta" aria-hidden><IcSeta /></span>
        <div className="vidro mv-emp-gan-no" data-tom="ambar"><span className="mv-emp-rotulo">Você verifica</span><b>Na maioria das vezes, não há margem disponível</b></div>
      </div>
      <div className="mv-emp-gan-desce" aria-hidden />
      <div className="mv-emp-gan-ganchos">
        {GANCHOS.map((g, i) => (
          <div key={g.t} className="vidro mv-emp-gan-g">
            <span className="num" aria-hidden>{i + 1}</span>
            <b>{g.t}</b>
            <span>{g.d}</span>
          </div>
        ))}
      </div>
      <div className="mv-emp-gan-desce" aria-hidden />
      <div className="vidro mv-emp-gan-fim">
        <span className="mv-emp-rotulo">Onde a conversa chega</span>
        <b>O processo de ressarcimento</b>
        <span>O carro-chefe: pedir o ressarcimento do que foi descontado nos últimos 10 anos, sem pagar nada para começar.</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ exercício: verdade ou mito */
const AFIRMACOES: { t: string; verdade: boolean; porque: string }[] = [
  { t: 'O cliente paga uma taxa pequena para dar entrada no processo.', verdade: false, porque: 'Para começar, não paga nada. A única cobrança são os 30% no final, retirados do valor recebido.' },
  { t: 'Os honorários são 30% do valor que o cliente receber.', verdade: true, porque: 'Percentual fixo, só no final, tirado do que ele receber.' },
  { t: 'Se o cliente mandar todos os documentos, dá para garantir o valor.', verdade: false, porque: 'Ninguém garante valor. Ele depende da análise dos extratos e do processo.' },
  { t: 'Em média, o ressarcimento leva de 6 a 12 meses.', verdade: true, porque: 'É a média que a gente informa. Sem data certa e sem prazos por etapa.' },
  { t: 'Quem entra com a ação é o atendente.', verdade: false, porque: 'Quem entra com a ação é o nosso advogado, o Dr. Rafael Menezes. Você prepara o caso.' },
  { t: 'Aumento de margem e portabilidade são ganchos de conversa, não promessas.', verdade: true, porque: 'Fale sempre em possibilidade. O carro-chefe é o processo.' },
  { t: 'Se a pessoa não tem empréstimo em nenhuma das 5 financeiras, a gente insiste até ela lembrar de algum.', verdade: false, porque: 'Se não souber, pergunte de novo uma vez. Se não tem em nenhuma, não é elegível: agradeça com carinho e encerre, sem insistir.' },
];
export function VerdadeOuMito() {
  const [resp, setResp] = useState<Record<number, boolean>>({});
  const feitos = Object.keys(resp).length;
  const acertos = AFIRMACOES.filter((a, i) => resp[i] === a.verdade).length;
  return (
    <div className="mv-emp-vm">
      {AFIRMACOES.map((a, i) => {
        const r = resp[i];
        const respondeu = r !== undefined;
        return (
          <div key={a.t} className="vidro mv-emp-vm-it" data-estado={!respondeu ? undefined : r === a.verdade ? 'certo' : 'errado'}>
            <span className="mv-emp-vm-tx">{a.t}</span>
            {!respondeu ? (
              <div className="mv-emp-vm-bts" role="group" aria-label={a.t}>
                <button type="button" data-tom="verde" onClick={() => setResp((s) => ({ ...s, [i]: true }))}><IcCheck />Verdade</button>
                <button type="button" data-tom="rubro" onClick={() => setResp((s) => ({ ...s, [i]: false }))}><IcX />Mito</button>
              </div>
            ) : (
              <span className="mv-emp-vm-r" role="status">
                <b>{r === a.verdade ? 'Acertou.' : 'Errou.'}</b> É {a.verdade ? 'verdade' : 'mito'}. {a.porque}
              </span>
            )}
          </div>
        );
      })}
      {feitos === AFIRMACOES.length && (
        <div className="mv-emp-vm-fim" role="status">
          <b className="num">{acertos} de {AFIRMACOES.length}</b> acertos.
          <button type="button" className="mv-link" onClick={() => setResp({})}>Fazer de novo</button>
        </div>
      )}
    </div>
  );
}
