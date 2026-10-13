/* Lição 7 — ilustrações e treinos próprios (prefixo mv-cv-): o funil da venda
   (clicável), a escada da confiança, os cinco princípios, o tradutor de jargão,
   as 4 frases do processo, a matriz canal × abordagem, o pivô do canal de
   empréstimo (diagrama + treino de ordenar), os R$ 10 dos honorários, os três
   blocos de documentos, o painel dos gatilhos honestos e o treino "pode ou não
   pode". Fatos da empresa: só os do brief. Estilos em 07-conversao.css. */
import { useState } from 'react';
import { Celular, Figura, IcCheck, IcX } from '../pecas';

/* ===================================================================== funil da venda */
type Degrau = { t: string; curto: string; pensa: string; faz: string[]; sinal: string; erro: string };
const DEGRAUS: Degrau[] = [
  {
    t: 'Atenção', curto: 'ele presta atenção em você',
    pensa: '“Será que isso é para mim? Quem está falando comigo?”',
    faz: [
      'Responder rápido, enquanto ele ainda está com o celular na mão',
      'Chamar pelo nome e dizer o seu nome + CAF',
      'Fazer uma pergunta só, fácil de responder',
    ],
    sinal: 'Ele responde e começa a contar a situação dele.',
    erro: 'Demorar horas para responder, ou abrir com um textão que ninguém lê.',
  },
  {
    t: 'Confiança', curto: 'ele sente que pode confiar',
    pensa: '“Isso não é golpe? Posso falar dos meus empréstimos com essa pessoa?”',
    faz: [
      'Escutar a dor e mostrar que entendeu',
      'Dizer com clareza quem é a CAF e quem cuida do processo: o advogado, Dr. Rafael Menezes',
      'Deixar claro que nada é pago antes',
    ],
    sinal: 'A desconfiança vira curiosidade: ele passa a perguntar como funciona.',
    erro: 'Pedir documento antes de ganhar a confiança.',
  },
  {
    t: 'Entendimento', curto: 'ele entende o processo',
    pensa: '“Tá, mas como isso funciona? O que eu ganho com isso?”',
    faz: [
      'Explicar em 4 frases: o que é, quem faz, quanto tempo leva, quanto custa',
      'Trocar o jargão por palavras do dia a dia',
      'Perguntar se ficou alguma dúvida',
    ],
    sinal: 'Ele repete com as palavras dele, ou pergunta sobre prazo e documentos.',
    erro: 'Usar termo técnico, ou citar um valor “só para ele ter uma ideia”.',
  },
  {
    t: 'Decisão', curto: 'ele decide seguir',
    pensa: '“Vale a pena para mim? Tenho algo a perder?”',
    faz: [
      'Mostrar o benefício para ele: pedir de volta, sem pagar nada para começar',
      'Responder cada dúvida com calma (a lição 8 ensina as objeções)',
      'Respeitar o tempo dele e convidar a família, se ele quiser',
    ],
    sinal: '“E o que eu preciso fazer?” É o sinal de compra mais claro que existe.',
    erro: 'Pressionar, ou inventar pressa (“é só até hoje”).',
  },
  {
    t: 'Documentos', curto: 'o sim vira ação',
    pensa: '“Tá bom. E agora, por onde eu começo?”',
    faz: [
      'Propor um primeiro passo pequeno, na hora: o Meu INSS',
      'Guiar junto, tela por tela',
      'Se não der agora, combinar o dia e o horário',
    ],
    sinal: 'Chega o primeiro documento. Agora, sim, o cliente entrou no processo.',
    erro: 'Mandar a lista inteira de uma vez e sumir.',
  },
];

export function FunilVenda() {
  const [sel, setSel] = useState(0);
  const d = DEGRAUS[sel];
  return (
    <Figura tag="Interativo" legenda="Toque em cada degrau do funil para ver o que o cliente pensa, o que você faz e qual sinal mostra que dá para avançar.">
      <div className="mv-cv-funil">
        <ol className="mv-cv-funil-faixas" aria-label="Os cinco degraus do funil da venda">
          {DEGRAUS.map((g, i) => (
            <li key={g.t} style={{ width: `${100 - i * 9}%` }}>
              <button type="button" className="mv-cv-faixa" data-i={i} aria-pressed={sel === i} onClick={() => setSel(i)}>
                <span className="mv-cv-faixa-n num">{i + 1}</span>
                <span className="mv-cv-faixa-tx"><b>{g.t}</b><small>{g.curto}</small></span>
              </button>
            </li>
          ))}
        </ol>
        <div className="mv-cv-funil-det" aria-live="polite">
          <header><span className="num">Degrau {sel + 1} de 5</span><b>{d.t}</b></header>
          <div className="mv-cv-bloco" data-tom="neutro"><small>O que o cliente pensa</small><span>{d.pensa}</span></div>
          <div className="mv-cv-bloco" data-tom="azul">
            <small>O que você faz</small>
            <ul>{d.faz.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
          <div className="mv-cv-bloco" data-tom="verde"><small>Sinal de que pode avançar</small><span>{d.sinal}</span></div>
          <div className="mv-cv-bloco" data-tom="rubro"><small>Erro comum neste degrau</small><span>{d.erro}</span></div>
          <div className="mv-cv-funil-nav">
            <button type="button" className="mv-link" disabled={sel === 0} onClick={() => setSel(sel - 1)}>Degrau anterior</button>
            <button type="button" className="mv-link" disabled={sel === DEGRAUS.length - 1} onClick={() => setSel(sel + 1)}>Próximo degrau</button>
          </div>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== escada da confiança */
const ESCADA = [
  { t: 'Responder rápido', s: 'e se apresentar' },
  { t: 'Escutar a dor', s: 'chamar pelo nome' },
  { t: 'Explicar simples', s: 'sem prometer valor' },
  { t: 'Mostrar segurança', s: 'nada pago antes' },
  { t: 'Cumprir o que diz', s: 'voltar na hora certa' },
];
const DERRUBA = ['Prometer valor', 'Sumir sem avisar', 'Pedir documento cedo demais', 'Pressionar', 'Esconder os 30%'];

export function EscadaConfianca() {
  return (
    <Figura tag="Diagrama" legenda="Cada degrau é uma atitude sua. O cliente só sobe quando o degrau está firme, e uma promessa quebrada derruba vários degraus de uma vez.">
      <div className="mv-cv-rolagem">
        <svg className="mv-cv-svg-largo" viewBox="0 0 760 290" role="img"
          aria-label="Escada da confiança em cinco degraus: 1, responder rápido e se apresentar; 2, escutar a dor e chamar pelo nome; 3, explicar simples, sem prometer valor; 4, mostrar segurança, nada pago antes; 5, cumprir o que diz e voltar na hora certa. No topo, os documentos chegam.">
          <defs>
            <marker id="mv-cv-seta-escada" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className="mv-cv-esc-ponta" d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>
          <text className="mv-cv-esc-conf" x="40" y="60">A confiança sobe a cada degrau</text>
          <path className="mv-cv-esc-seta" d="M60,150 Q300,114 526,40" markerEnd="url(#mv-cv-seta-escada)" />
          <text className="mv-cv-esc-meta" x="740" y="20" textAnchor="end">No topo: os documentos chegam</text>
          {ESCADA.map((e, i) => {
            const x = 20 + i * 140;
            const topo = 260 - (i + 1) * 42;
            return (
              <g key={e.t} className="mv-cv-esc-degrau" data-i={i}>
                <rect x={x} y={topo} width="140" height={270 - topo} rx="4" />
                <circle cx={x + 18} cy={topo - 14} r="11" />
                <text className="mv-cv-esc-n" x={x + 18} y={topo - 10} textAnchor="middle">{i + 1}</text>
                <text className="mv-cv-esc-t" x={x + 70} y={topo + 22} textAnchor="middle">{e.t}</text>
                <text className="mv-cv-esc-s" x={x + 70} y={topo + 40} textAnchor="middle">{e.s}</text>
              </g>
            );
          })}
          <line className="mv-cv-esc-chao" x1="10" y1="270" x2="750" y2="270" />
        </svg>
      </div>
      <div className="mv-cv-derruba">
        <small>O que faz o cliente descer degraus</small>
        <ul>{DERRUBA.map((t) => <li key={t}><IcX />{t}</li>)}</ul>
      </div>
    </Figura>
  );
}

/* ===================================================================== os cinco princípios */
const PRINCIPIOS = [
  {
    t: 'Rapport (sintonia)',
    porque: 'Ninguém entrega documentos para quem não confia. Sintonia é o cliente sentir que do outro lado existe uma pessoa que escuta e respeita.',
    evite: '“Prezado cliente, informamos que a sua solicitação foi recebida.”',
    diga: '“Dona Maria, entendi: esses descontos estão pesando no fim do mês, né?”',
  },
  {
    t: 'Explicar simples',
    porque: 'Quem não entende não decide, ou decide com medo e desiste no meio do caminho.',
    evite: '“Honorários advocatícios de 30% ao final da demanda.”',
    diga: '“De cada R$ 10 que a senhora receber, R$ 7 são seus.”',
  },
  {
    t: 'Mostrar o benefício para ele',
    porque: 'O cliente decide pelo que muda na vida dele, e não pelo que a empresa faz.',
    evite: '“A CAF trabalha com processos de juros abusivos.”',
    diga: '“A ideia é pedir de volta o que já saiu do seu benefício, sem a senhora pagar nada para começar.”',
  },
  {
    t: 'Segurança',
    porque: 'Muita gente idosa já ouviu falar de golpe. A desconfiança é saudável, e o que acalma é informação verdadeira, não um “pode confiar”.',
    evite: '“Pode confiar, é tudo certinho.”',
    diga: '“A gente nunca pede pagamento adiantado. Quem cuida do processo é o nosso advogado, e a assinatura é pelo gov.br, o sistema oficial do governo.”',
  },
  {
    t: 'Próximo passo sempre combinado',
    porque: 'Conversa que termina sem nada combinado esfria e some. O próximo passo dá direção para os dois lados.',
    evite: '“Qualquer coisa, me chama.”',
    diga: '“Combinado: amanhã cedo a sua neta te ajuda e eu te chamo para pegarmos os documentos.”',
  },
];

export function Principios() {
  return (
    <div className="mv-cv-princ">
      {PRINCIPIOS.map((p, i) => (
        <article key={p.t} className="vidro mv-cv-princ-it">
          <header><span className="mv-cv-princ-n num">{i + 1}</span><b>{p.t}</b></header>
          <span className="mv-cv-princ-pq">{p.porque}</span>
          <div className="mv-cv-princ-ex" data-tom="rubro"><small><IcX />Evite</small><span>{p.evite}</span></div>
          <div className="mv-cv-princ-ex" data-tom="verde"><small><IcCheck />Diga</small><span>{p.diga}</span></div>
        </article>
      ))}
    </div>
  );
}

/* ===================================================================== tradutor de jargão */
const TRADUCOES = [
  { j: 'Ressarcimento dos descontos dos últimos 10 anos', s: 'Pedir de volta o que foi descontado do seu benefício nos últimos 10 anos, se houver juros abusivos. O resultado depende da análise.' },
  { j: 'Honorários advocatícios de 30% ao final', s: 'Para começar, a senhora não paga nada. No final, de cada R$ 10 que receber, R$ 7 são seus e R$ 3 ficam com o advogado.' },
  { j: 'Margem consignável comprometida', s: 'A parte do benefício que pode ir para empréstimos já está toda ocupada. Por isso o banco não libera um novo agora.' },
  { j: 'Portabilidade do consignado', s: 'Levar o seu empréstimo para outro banco. Em alguns casos, essa troca libera um valor para a senhora.' },
  { j: 'Procuração com assinatura digital pelo gov.br', s: 'Um documento que autoriza o advogado a cuidar do seu caso. A senhora assina pela internet, no gov.br, o sistema oficial do governo.' },
  { j: 'Extrato de pagamento de benefício', s: 'O papel do Meu INSS que mostra, mês a mês, quanto a senhora recebeu e o que foi descontado.' },
];

export function TradutorSimples() {
  const [abertos, setAbertos] = useState<Set<number>>(() => new Set());
  const todos = abertos.size === TRADUCOES.length;
  function alternar(i: number) {
    setAbertos((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }
  return (
    <Figura tag="Interativo" legenda="Tente dizer em voz alta, do seu jeito, antes de tocar. Depois compare com a sugestão.">
      <div className="mv-cv-trad">
        <div className="mv-cv-trad-topo">
          <span className="num">{abertos.size} de {TRADUCOES.length} traduzidos</span>
          <button type="button" className="mv-link"
            onClick={() => setAbertos(todos ? new Set() : new Set(TRADUCOES.map((_, i) => i)))}>
            {todos ? 'Esconder todos' : 'Mostrar todos'}
          </button>
        </div>
        <ul className="mv-cv-trad-lista">
          {TRADUCOES.map((t, i) => {
            const aberto = abertos.has(i);
            return (
              <li key={t.j} data-aberto={aberto ? '' : undefined}>
                <button type="button" aria-expanded={aberto} onClick={() => alternar(i)}>
                  <small>Jeito técnico</small>
                  <b>{t.j}</b>
                  <span className="mv-cv-trad-acao">{aberto ? 'Esconder' : 'Como dizer ao cliente'}</span>
                </button>
                {aberto && <div className="mv-cv-trad-simples"><small>Em palavras simples</small><span>“{t.s}”</span></div>}
              </li>
            );
          })}
        </ul>
      </div>
    </Figura>
  );
}

/* ===================================================================== as 4 frases do processo */
const QUATRO = [
  { q: 'O que é', t: 'Se houver juros abusivos, uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise.' },
  { q: 'Quem faz', t: 'O nosso advogado, o Dr. Rafael Menezes, entra com a ação.' },
  { q: 'Quanto tempo', t: 'Leva em média de 6 a 12 meses.' },
  { q: 'Quanto custa', t: 'Nada para começar. No final, 30% do valor que o cliente receber ficam para o advogado.' },
];
export function QuatroFrases() {
  return (
    <Figura tag="Esquema" legenda="As quatro perguntas que todo cliente tem, mesmo quando não pergunta. Responda as quatro, nessa ordem, e o processo fica claro.">
      <ol className="mv-cv-quatro">
        {QUATRO.map((x, i) => (
          <li key={x.q}>
            <span className="mv-cv-quatro-n num">{i + 1}</span>
            <small>{x.q}</small>
            <span>{x.t}</span>
          </li>
        ))}
      </ol>
    </Figura>
  );
}

/* ===================================================================== matriz canal × abordagem */
const MATRIZ: { r: string; juros: string; emp: string }[] = [
  { r: 'O que ele quer', juros: 'A revisão dos juros. Já chega querendo o processo.', emp: 'Dinheiro rápido: um empréstimo novo.' },
  { r: 'Como chega até você', juros: 'O robô pegou nome e CPF e avisou que a análise começou.', emp: 'O robô e a IA fizeram as 3 portas, mandaram a “pré-aprovada” e a lista de documentos.' },
  { r: 'Tipo de venda', juros: 'Direta.', emp: 'Consultiva, com o pivô honesto.' },
  { r: 'Seu primeiro objetivo', juros: 'Confirmar o perfil e explicar o processo.', emp: 'Apresentar-se, explicar a “pré-aprovada”, perguntar o que precisa e pedir os extratos.' },
  { r: 'Argumento central', juros: 'Pedir de volta o que foi descontado, sem pagar nada para começar.', emp: 'A verdade sobre a margem e os caminhos possíveis.' },
  { r: 'Onde mora o risco', juros: 'Pular a explicação dos 30%, ou prometer valor.', emp: 'Deixar o cliente achar que o dinheiro está aprovado, ou disfarçar que o processo é outra coisa.' },
  { r: 'Fechamento', juros: 'Começar pelos documentos do Meu INSS.', emp: 'Completar os documentos do Meu INSS (os extratos da verificação já adiantam).' },
];
export function MatrizCanal() {
  return (
    <Figura tag="Comparativo" legenda="Mesmo processo, dois pontos de partida. Leia linha por linha: o que muda é o caminho até o “sim”.">
      <div className="mv-cv-matriz" role="table" aria-label="Matriz canal × abordagem">
        <div className="mv-cv-mz-lin mv-cv-mz-cab" role="row">
          <span role="columnheader" className="mv-cv-mz-rot" />
          <div role="columnheader" data-tom="azul"><small>Tráfego do Andrius</small><b>Canal de juros abusivos</b></div>
          <div role="columnheader" data-tom="ambar"><small>Tráfego de empréstimo</small><b>Canal de empréstimo</b></div>
        </div>
        {MATRIZ.map((m) => (
          <div key={m.r} className="mv-cv-mz-lin" role="row">
            <span role="rowheader" className="mv-cv-mz-rot">{m.r}</span>
            <span role="cell" data-tom="azul">{m.juros}</span>
            <span role="cell" data-tom="ambar">{m.emp}</span>
          </div>
        ))}
      </div>
    </Figura>
  );
}

/* ===================================================================== o pivô do canal de empréstimo */
function Caixa({ x, y, w, h, t, s, tom }: { x: number; y: number; w: number; h: number; t: string; s?: string; tom: string }) {
  const cx = x + w / 2;
  return (
    <g className="mv-cv-pv-cx" data-tom={tom}>
      <rect x={x} y={y} width={w} height={h} rx="10" />
      <text className="mv-cv-pv-t" x={cx} y={s ? y + h / 2 - 3 : y + h / 2 + 5} textAnchor="middle">{t}</text>
      {s && <text className="mv-cv-pv-s" x={cx} y={y + h / 2 + 15} textAnchor="middle">{s}</text>}
    </g>
  );
}
export function PivoEmprestimo() {
  const seta = 'url(#mv-cv-seta-pivo)';
  return (
    <Figura tag="Diagrama" legenda="O pivô honesto: primeiro a apresentação e a verdade, depois os caminhos. Nunca o contrário.">
      <div className="mv-cv-rolagem">
        <svg className="mv-cv-svg-largo" viewBox="0 0 760 380" role="img"
          aria-label="Fluxo do pivô no canal de empréstimo. O cliente quer dinheiro rápido. Você se apresenta e explica que a pré-aprovada não é valor liberado, pergunta o que a pessoa precisa e pede os extratos do Meu INSS para conferir. Tem margem? Se sim, combine o próximo passo com o gestor. Se não, conte a verdade com calma e apresente três caminhos: aumento de margem, como possibilidade; portabilidade, que pode liberar acima de R$ 1.500; e o processo de ressarcimento dos últimos 10 anos, sem pagar nada antes. No fim, sempre um próximo passo combinado.">
          <defs>
            <marker id="mv-cv-seta-pivo" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className="mv-cv-pv-ponta" d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>

          {/* linha 1: o pedido e o primeiro passo de sempre (apresentar-se, pré-aprovada, pergunta, extratos) */}
          <Caixa x={6} y={16} w={166} h={54} t="O que ele quer" s="dinheiro rápido" tom="ambar" />
          <Caixa x={200} y={16} w={166} h={54} t="1. Apresentar-se" s="explicar a pré-aprovada" tom="neutro" />
          <Caixa x={394} y={16} w={166} h={54} t="2. Perguntar" s="o que a pessoa precisa" tom="neutro" />
          <Caixa x={588} y={16} w={166} h={54} t="3. Pedir os extratos" s="e conferir a situação" tom="neutro" />
          <path className="mv-cv-pv-fio" d="M172,43 L196,43" markerEnd={seta} />
          <path className="mv-cv-pv-fio" d="M366,43 L390,43" markerEnd={seta} />
          <path className="mv-cv-pv-fio" d="M560,43 L584,43" markerEnd={seta} />

          {/* linha 2: a pergunta que decide */}
          <path className="mv-cv-pv-fio" d="M671,70 L671,90 L380,90 L380,106" markerEnd={seta} />
          <polygon className="mv-cv-pv-losango" points="300,140 380,110 460,140 380,170" />
          <text className="mv-cv-pv-t" x="380" y="145" textAnchor="middle">Tem margem?</text>
          <path className="mv-cv-pv-fio" d="M300,140 L234,140" markerEnd={seta} />
          <text className="mv-cv-pv-r" x="267" y="132" textAnchor="middle">Sim</text>
          <path className="mv-cv-pv-fio" d="M460,140 L526,140" markerEnd={seta} />
          <text className="mv-cv-pv-r" x="493" y="132" textAnchor="middle">Não</text>
          <Caixa x={30} y={113} w={200} h={54} t="Tem margem" s="combine com o seu gestor" tom="neutro" />
          <Caixa x={530} y={113} w={200} h={54} t="4. Contar a verdade" s="sem margem hoje, com calma" tom="ambar" />

          {/* linha 3: os três caminhos */}
          <path className="mv-cv-pv-fio" d="M630,167 L630,196 M130,196 L630,196 M130,196 L130,216 M380,196 L380,216 M630,196 L630,216" />
          <path className="mv-cv-pv-fio" d="M130,212 L130,216" markerEnd={seta} />
          <path className="mv-cv-pv-fio" d="M380,212 L380,216" markerEnd={seta} />
          <path className="mv-cv-pv-fio" d="M630,212 L630,216" markerEnd={seta} />
          <Caixa x={15} y={220} w={230} h={60} t="Aumento de margem" s="possibilidade, caso a caso" tom="verde" />
          <Caixa x={265} y={220} w={230} h={60} t="Portabilidade" s="pode liberar acima de R$ 1.500" tom="verde" />
          <Caixa x={515} y={220} w={230} h={60} t="Processo de ressarcimento" s="10 anos · nada pago antes" tom="verde" />
          <text className="mv-cv-pv-r" x="255" y="186" textAnchor="middle">5. Apresentar os caminhos</text>

          {/* linha 4: sempre um próximo passo */}
          <path className="mv-cv-pv-fio" d="M130,280 L130,300 L630,300 L630,280 M380,280 L380,316" markerEnd={seta} />
          <Caixa x={220} y={320} w={320} h={52} t="6. Próximo passo combinado" s="o cliente sabe o que vem agora" tom="azul" />
        </svg>
      </div>
    </Figura>
  );
}

/* ===================================================================== treino: o pivô em ordem */
const PIVO_PASSOS = [
  'Apresentar-se e explicar o que é a “pré-aprovada”',
  'Perguntar o que a pessoa está precisando',
  'Pedir os extratos do Meu INSS e conferir',
  'Contar a verdade sobre a margem, com calma',
  'Apresentar os caminhos, deixando claro que o processo é outra coisa',
  'Combinar o próximo passo: os documentos',
];
const EMBARALHADO = [3, 0, 5, 2, 4, 1];

export function OrdenarPivo() {
  const [feitos, setFeitos] = useState<number[]>([]);
  const [errou, setErrou] = useState<number | null>(null);
  const fim = feitos.length === PIVO_PASSOS.length;
  function escolher(i: number) {
    if (feitos.includes(i)) return;
    if (i === feitos.length) { setFeitos([...feitos, i]); setErrou(null); } else setErrou(i);
  }
  return (
    <div className="vidro mv-cv-ord">
      <div className="mv-cv-ord-cab">
        <span className="mv-teste-tag">Treino</span>
        <b>Monte o pivô na ordem certa</b>
        <span className="mv-cv-ord-sub">Toque nos cartões na ordem em que eles acontecem na conversa com o cliente do canal de empréstimo.</span>
      </div>
      <ol className="mv-cv-ord-trilho" aria-label="A sua sequência">
        {PIVO_PASSOS.map((_, pos) => (
          <li key={pos} data-cheio={feitos[pos] !== undefined ? '' : undefined}>
            <span className="num">{pos + 1}</span>
            {feitos[pos] !== undefined ? PIVO_PASSOS[feitos[pos]] : '…'}
          </li>
        ))}
      </ol>
      {!fim && (
        <div className="mv-cv-ord-opcoes">
          {EMBARALHADO.map((i) => (
            <button key={i} type="button" disabled={feitos.includes(i)} data-errou={errou === i ? '' : undefined} onClick={() => escolher(i)}>
              {PIVO_PASSOS[i]}
            </button>
          ))}
        </div>
      )}
      {errou !== null && !fim && (
        <p className="mv-cv-ord-msg" role="status">
          Ainda não. Esse passo vem {errou > feitos.length ? 'mais para a frente' : 'antes'}. Pense: o que precisa acontecer primeiro?
        </p>
      )}
      {fim && (
        <div className="mv-cv-ord-fim" role="status">
          <b>Isso mesmo.</b> Primeiro a apresentação e a verdade sobre a pré-aprovada, depois conferir e contar, depois os caminhos, e sempre um próximo passo no fim.
          <button type="button" className="mv-link" onClick={() => { setFeitos([]); setErrou(null); }}>Fazer de novo</button>
        </div>
      )}
    </div>
  );
}

/* ===================================================================== os R$ 10 dos honorários */
export function DezReais() {
  const moedas = Array.from({ length: 10 }, (_, i) => ({ i, cx: 80 + i * 64 + (i >= 7 ? 24 : 0), cliente: i < 7 }));
  return (
    <Figura tag="Exemplo" legenda="Valores de exemplo, só para explicar a divisão. Não é promessa de quanto o cliente vai receber.">
      <div className="mv-cv-rolagem">
        <svg className="mv-cv-svg-medio" viewBox="0 0 760 170" role="img"
          aria-label="Dez moedas de um real. Sete, em verde, ficam com o cliente: 70%. Três, em cinza, são os honorários do advogado: 30%. Nada é pago antes: os 30% saem do valor recebido, no final.">
          <text className="mv-cv-dez-tit" x="380" y="20" textAnchor="middle">De cada R$ 10 que o cliente receber no final do processo</text>
          {moedas.map((m) => (
            <g key={m.i} className="mv-cv-moeda" data-de={m.cliente ? 'cliente' : 'adv'}>
              <circle cx={m.cx} cy="62" r="26" />
              <text x={m.cx} y="67" textAnchor="middle">R$ 1</text>
            </g>
          ))}
          <path className="mv-cv-dez-chave" data-de="cliente" d="M56,98 L56,106 L488,106 L488,98 M272,106 L272,112" />
          <path className="mv-cv-dez-chave" data-de="adv" d="M528,98 L528,106 L706,106 L706,98 M617,106 L617,112" />
          <text className="mv-cv-dez-r" data-de="cliente" x="272" y="132" textAnchor="middle">R$ 7 ficam com o cliente (70%)</text>
          <text className="mv-cv-dez-r" data-de="adv" x="617" y="132" textAnchor="middle">R$ 3 de honorários (30%)</text>
          <text className="mv-cv-dez-nota" x="380" y="160" textAnchor="middle">Nada sai do bolso antes: os 30% saem do valor recebido, no final.</text>
        </svg>
      </div>
    </Figura>
  );
}

/* ===================================================================== os três blocos de documentos */
const BLOCOS = [
  {
    t: 'Meu INSS', tom: 'azul', quando: 'Primeiro bloco',
    itens: [
      { d: 'Carta de concessão', p: 'Mostra qual é o seu benefício.' },
      { d: 'Extrato de empréstimo consignado', p: 'Mostra os seus empréstimos e com quais bancos.' },
      { d: 'Extratos de pagamento dos últimos 10 anos', p: 'Mostram, mês a mês, o que foi descontado do benefício. É a base do pedido.' },
    ],
  },
  {
    t: 'gov.br', tom: 'ambar', quando: 'Segundo bloco',
    itens: [
      { d: 'Imposto de renda dos últimos 3 anos', p: 'Um print de cada ano. Se a pessoa declara, também a DEC e o REC. Faz parte da documentação básica.' },
      { d: 'Situação cadastral do CPF', p: 'Confirma a situação do seu CPF na Receita Federal. A consulta é no site da Receita, só com o CPF e a data de nascimento.' },
    ],
  },
  {
    t: 'Documentos pessoais', tom: 'verde', quando: 'Terceiro bloco',
    itens: [
      { d: 'RG ou CNH e foto do rosto', p: 'Confirmam que é a própria pessoa fazendo, e não outra pessoa no nome dela.' },
      { d: 'Comprovante de residência', p: 'Do mês atual ou do mês passado. Se estiver no nome de outra pessoa, a gente pede o documento dela e faz uma declaração.' },
      { d: 'E-mail', p: 'Muito importante. Se não tiver, sem problema: a gente cria um.' },
    ],
  },
];
export function BlocosDocumentos() {
  return (
    <Figura tag="Esquema" legenda="A ordem sugerida do pedido (sem ser rígida) e o “por quê” de cada documento, do jeito que você explica ao cliente. Os detalhes de cada um estão nas lições 10, 11 e 12.">
      <div className="mv-cv-blocos">
        {BLOCOS.map((b, i) => (
          <section key={b.t} className="mv-cv-bloco-doc" data-tom={b.tom} aria-label={b.t}>
            <header><span className="num">{i + 1}</span><span><small>{b.quando}</small><b>{b.t}</b></span></header>
            <ul>
              {b.itens.map((it) => (
                <li key={it.d}><b>{it.d}</b><span>{it.p}</span></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Figura>
  );
}

/* ===================================================================== gatilhos: pode × não pode */
const PODE = [
  { t: 'Clareza', d: 'Tudo explicado em palavras simples, inclusive os 30%, logo no começo.' },
  { t: 'Segurança', d: 'Nada pago antes, advogado responsável, assinatura pelo gov.br, dados só para o processo.' },
  { t: 'Facilidade', d: '“A gente faz junto”: passo a passo, um bloco de documentos por vez.' },
  { t: 'Prova de que é gratuito', d: 'A conta dos 30%: saem do valor recebido, no final. Não existe taxa de entrada.' },
  { t: 'Respeito', d: 'Tempo para pensar e a família convidada para a conversa, se o cliente quiser.' },
  { t: 'Verdade sobre o tempo', d: '“Quanto antes os documentos chegarem, antes o advogado pode entrar com o processo.”' },
];
const NAO_PODE = [
  { t: 'Urgência falsa', d: '“Só até hoje”, “últimas vagas”, “o prazo acaba amanhã”.' },
  { t: 'Promessa de valor', d: '“A senhora vai receber uns R$ 10 mil”, “é causa ganha”.' },
  { t: 'Pressão', d: 'Mensagem atrás de mensagem, cobrança, tom de bronca.' },
  { t: 'Medo exagerado', d: '“Se não fizer agora, vai perder tudo.”' },
  { t: 'Disfarce', d: 'Deixar o cliente achar que o processo é o empréstimo, ou esconder os 30%.' },
  { t: 'História inventada', d: '“Uma cliente igual à senhora recebeu tanto na semana passada.”' },
];
export function GatilhosPainel() {
  return (
    <div className="mv-cv-gat">
      <section className="vidro mv-cv-gat-col" data-tom="verde" aria-label="Gatilhos honestos: pode">
        <header><IcCheck /><b>Pode: gatilhos honestos</b></header>
        <ul>{PODE.map((g) => <li key={g.t}><b>{g.t}</b><span>{g.d}</span></li>)}</ul>
      </section>
      <section className="vidro mv-cv-gat-col" data-tom="rubro" aria-label="O que não pode">
        <header><IcX /><b>Não pode: nunca</b></header>
        <ul>{NAO_PODE.map((g) => <li key={g.t}><b>{g.t}</b><span>{g.d}</span></li>)}</ul>
      </section>
    </div>
  );
}

/* ===================================================================== treino: pode ou não pode? */
const FRASES = [
  { f: '“Para começar, a senhora não paga nada. Os 30% saem só no final, do valor que a senhora receber.”', pode: true, pq: 'É a prova de que é gratuito, dita com clareza. Verdade pura.' },
  { f: '“Corre, que essa condição é só até hoje!”', pode: false, pq: 'Urgência falsa. Não existe “condição de hoje” no nosso processo.' },
  { f: '“A senhora vai receber pelo menos uns R$ 10 mil.”', pode: false, pq: 'Promessa de valor. O valor depende da análise e do resultado do processo.' },
  { f: '“A gente faz junto: eu te guio passo a passo no Meu INSS.”', pode: true, pq: 'Facilidade verdadeira. Tira o medo de “não sei mexer”.' },
  { f: '“A assinatura é feita pelo gov.br, o sistema oficial do governo.”', pode: true, pq: 'Segurança com informação verificável.' },
  { f: '“Se não mandar os documentos agora, vai perder tudo.”', pode: false, pq: 'Pressão com medo. Afasta o cliente e não é verdade.' },
  { f: '“Quanto antes os documentos chegarem, antes o advogado pode entrar com o processo.”', pode: true, pq: 'É verdade sobre o tempo, sem inventar prazo nem ameaça.' },
  { f: '“Semana passada uma cliente igual à senhora recebeu R$ 15 mil.”', pode: false, pq: 'História inventada e promessa disfarçada. Cada caso é um caso.' },
];
export function ClassificarGatilhos() {
  const [resp, setResp] = useState<Record<number, boolean>>({});
  const feitos = Object.keys(resp).length;
  const acertos = FRASES.filter((x, i) => resp[i] === x.pode).length;
  return (
    <div className="vidro mv-cv-class">
      <div className="mv-cv-class-cab">
        <span className="mv-teste-tag">Treino</span>
        <b>Pode ou não pode?</b>
        <span className="num">{feitos} de {FRASES.length} respondidas</span>
      </div>
      {FRASES.map((x, i) => {
        const r = resp[i];
        const respondeu = r !== undefined;
        return (
          <div key={x.f} className="mv-cv-class-it" data-estado={!respondeu ? undefined : r === x.pode ? 'certo' : 'errado'}>
            <span className="mv-cv-class-f">{x.f}</span>
            {!respondeu ? (
              <div className="mv-cv-class-bts">
                <button type="button" data-tom="verde" onClick={() => setResp((s) => ({ ...s, [i]: true }))}><IcCheck />Pode</button>
                <button type="button" data-tom="rubro" onClick={() => setResp((s) => ({ ...s, [i]: false }))}><IcX />Não pode</button>
              </div>
            ) : (
              <span className="mv-cv-class-r"><b>{r === x.pode ? 'Acertou.' : 'Errou.'}</b> {x.pq}</span>
            )}
          </div>
        );
      })}
      {feitos === FRASES.length && (
        <div className="mv-cv-class-fim" role="status">
          <b className="num">{acertos} de {FRASES.length}</b> acertos.
          <button type="button" className="mv-link" onClick={() => setResp({})}>Fazer de novo</button>
        </div>
      )}
    </div>
  );
}

/* ===================================================================== fechamento anotado */
const ANOTACOES = [
  { h: '14:21', t: 'Comemorou e resumiu', d: 'Uma frase só: “vamos dar entrada no seu processo”. O cliente sente que decidiu bem.' },
  { h: '14:21', t: 'Um passo pequeno, agora', d: 'Só a carta de concessão. Nada de lista inteira.' },
  { h: '14:23', t: 'Fez junto', d: 'Disse exatamente onde tocar e o que digitar no Meu INSS.' },
  { h: '14:29', t: 'O primeiro documento chegou', d: 'Esse é o fechamento de verdade. Comemore a entrega.' },
  { h: '14:32', t: 'Próximo passo combinado', d: 'Não deu para seguir agora? Marque o momento, e cumpra.' },
];
export function FechamentoAnotado() {
  return (
    <div className="mv-cv-duo">
      <Celular
        contato="Seu Antônio"
        sub="cliente · pensionista"
        legenda="O “sim” virou ação na mesma conversa."
        bolhas={[
          { de: 'cliente', texto: 'Entendi tudo. Pode ser, vamos fazer sim.', hora: '14:20' },
          { de: 'eu', texto: 'Que ótimo, Seu Antônio! Então vamos dar entrada no seu processo. 😊', hora: '14:21' },
          { de: 'eu', texto: 'O primeiro passo é bem simples: pegar a sua carta de concessão no aplicativo Meu INSS. O senhor está com o celular aí agora?', hora: '14:21' },
          { de: 'cliente', texto: 'Tô sim. Já abri o aplicativo.', hora: '14:23' },
          { de: 'eu', texto: 'Perfeito. Na tela inicial, toque na busca, onde está escrito “Do que você precisa?”, e digite: carta de concessão.', hora: '14:23' },
          { de: 'cliente', tipo: 'documento', legenda: 'Carta de Concessão.pdf', hora: '14:29' },
          { de: 'eu', texto: 'Recebi, Seu Antônio! Ficou certinho. Agora vamos para o próximo: o extrato de empréstimo consignado. É o mesmo caminho, pela busca.', hora: '14:30' },
          { de: 'cliente', texto: 'Agora não dá, vou sair. Pode ser amanhã cedo?', hora: '14:32' },
          { de: 'eu', texto: 'Claro! Combinado: amanhã cedo eu te chamo aqui e a gente continua de onde parou. Obrigado, Seu Antônio!', hora: '14:32' },
        ]}
      />
      <ol className="mv-cv-anot" aria-label="O que o atendente fez em cada momento">
        {ANOTACOES.map((a, i) => (
          <li key={a.t}>
            <span className="mv-cv-anot-n num">{i + 1}</span>
            <div><small className="num">{a.h}</small><b>{a.t}</b><span>{a.d}</span></div>
          </li>
        ))}
      </ol>
    </div>
  );
}
