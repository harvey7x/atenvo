/* Lição 6 — ilustrações e treinos próprios (prefixo mv-pc-): a passagem do
   robô para você, o termômetro do lead, a anatomia da primeira mensagem, as
   perguntas do roteiro, o funil e o fluxograma da qualificação, o simulador do
   roteiro, perguntas abertas × fechadas, o iceberg da dor, as atitudes da
   escuta, a ficha de anotação, a anatomia do áudio, os erros clássicos e o
   checklist do primeiro contato. Estilos em 06-primeiro-contato.css. */
import { useState, type ReactNode } from 'react';
import { BomRuim, Celular, copiar, Figura, IcCheck, type Bolha } from '../pecas';

/* ===================================================================== passagem do robô para você */
type Quem = 'robo' | 'ia' | 'voce';
const ROTULO: Record<Quem, string> = { robo: 'Robô', ia: 'IA', voce: 'Você' };
const TRILHOS: { canal: string; sub: string; passos: { q: Quem; t: string }[]; chega: string[]; fica: string[]; ordem?: boolean }[] = [
  {
    canal: 'Juros abusivos', sub: 'tráfego do Andrius · começa com um vídeo',
    passos: [
      { q: 'robo', t: 'Boas-vindas' }, { q: 'robo', t: 'Vídeo curto' }, { q: 'robo', t: 'Análise gratuita? SIM' },
      { q: 'robo', t: 'Nome completo' }, { q: 'robo', t: 'CPF' }, { q: 'robo', t: '“Recebido!”' }, { q: 'voce', t: 'Você assume' },
    ],
    chega: ['Nome completo', 'CPF', 'O SIM para a análise gratuita'],
    fica: ['Apresentar-se: seu nome + CAF', 'Todas as perguntas do roteiro de qualificação', 'Descobrir o que ele quer e qual é a dor'],
  },
  {
    canal: 'Empréstimo', sub: 'tráfego de empréstimo · boas-vindas numa imagem',
    passos: [
      { q: 'robo', t: 'Boas-vindas' }, { q: 'robo', t: 'Análise de valor? SIM' }, { q: 'robo', t: 'Nome completo' },
      { q: 'robo', t: 'CPF' }, { q: 'robo', t: '“Recebido!”' }, { q: 'ia', t: 'As 3 portas' },
      { q: 'ia', t: '“Pré-aprovada” + documentos' }, { q: 'ia', t: 'Usa gov.br / Meu INSS?' }, { q: 'voce', t: 'Você assume' },
    ],
    chega: ['Nome completo e CPF', 'As respostas das 3 portas (benefício, familiar, financeira)', 'A lista de documentos', 'A resposta sobre o gov.br e o Meu INSS', 'A expectativa de “pré-aprovada”'],
    fica: ['Apresentar-se: seu nome + CAF', 'Explicar com honestidade a “pré-aprovada”', 'Uma pergunta aberta: o que ele precisa', 'Pedir os extratos do Meu INSS'],
    ordem: true,
  },
];

export function Passagem() {
  return (
    <Figura legenda="O que já aconteceu antes de você entrar, em cada canal. Tudo o que está em “Chega para você com” você não pergunta de novo.">
      <div className="mv-pc-pass">
        {TRILHOS.map((tr) => (
          <section key={tr.canal} className="mv-pc-trilho" aria-label={`Canal de ${tr.canal}`}>
            <header><b>Canal de {tr.canal.toLowerCase()}</b><small>{tr.sub}</small></header>
            <ol className="mv-pc-fluxo">
              {tr.passos.map((p, i) => (
                <li key={p.t} data-quem={p.q}>
                  {i > 0 && <i className="mv-pc-seta" aria-hidden />}
                  <span className="mv-pc-chip"><small>{ROTULO[p.q]}</small>{p.t}</span>
                </li>
              ))}
            </ol>
            <div className="mv-pc-tem">
              <div data-tom="verde"><small>Chega para você com</small><ul>{tr.chega.map((c) => <li key={c}>{c}</li>)}</ul></div>
              <div data-tom="azul">
                <small>{tr.ordem ? 'Fica com você, nesta ordem' : 'Fica com você'}</small>
                {tr.ordem
                  ? <ol>{tr.fica.map((c) => <li key={c}>{c}</li>)}</ol>
                  : <ul>{tr.fica.map((c) => <li key={c}>{c}</li>)}</ul>}
              </div>
            </div>
          </section>
        ))}
        <div className="mv-pc-legenda" aria-hidden>
          <span><i />Mensagem automática do robô</span>
          <span><i data-quem="ia" />Conversa com a IA</span>
          <span><i data-quem="voce" />Você, atendente</span>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== termômetro do lead */
const MOMENTOS = [
  { z: 'q', t: 'Agora', d: 'Acabou de mandar o CPF e está com o celular na mão. Responde na hora.' },
  { z: 'q', t: 'Alguns minutos depois', d: 'Ainda lembra de tudo. O robô disse que alguém voltaria logo.' },
  { z: 'm', t: 'Algumas horas depois', d: 'Já está em outra atividade. Pode nem ver a sua mensagem, ou deixar para depois.' },
  { z: 'f', t: 'No dia seguinte', d: '“Quem é mesmo?” A conversa e a confiança começam quase do zero.' },
];
export function Termometro() {
  return (
    <Figura legenda="Ilustrativo, sem escala: mostra a ideia de que o interesse esfria com o tempo. Não é uma medição.">
      <span className="mv-pc-rolo-dica">Arraste para o lado para ver o gráfico inteiro.</span>
      <div className="mv-pc-rolo">
      <svg viewBox="0 0 760 212" role="img" aria-label="Gráfico ilustrativo: o interesse do cliente começa alto quando ele manda o CPF e vai caindo com o passar dos minutos, das horas e do dia seguinte.">
        <text className="mv-pc-term-tx" x="24" y="14" textAnchor="start">Interesse do cliente</text>
        <rect className="mv-pc-term-z" data-z="q" x="24" y="24" width="290" height="150" />
        <rect className="mv-pc-term-z" data-z="m" x="314" y="24" width="240" height="150" />
        <rect className="mv-pc-term-z" data-z="f" x="554" y="24" width="190" height="150" />
        <text className="mv-pc-term-zt" data-z="q" x="169" y="44" textAnchor="middle">Quente</text>
        <text className="mv-pc-term-zt" data-z="m" x="434" y="44" textAnchor="middle">Morno</text>
        <text className="mv-pc-term-zt" data-z="f" x="649" y="44" textAnchor="middle">Frio</text>
        <path className="mv-pc-term-area" d="M24,62 C114,64 184,96 254,116 S414,149 494,154 S684,166 744,167 L744,174 L24,174 Z" />
        <path className="mv-pc-term-curva" d="M24,62 C114,64 184,96 254,116 S414,149 494,154 S684,166 744,167" />
        <path className="mv-pc-term-eixo" d="M24,24 L24,174 L744,174" />
        {[[24, 62], [254, 116], [494, 154], [744, 167]].map(([x, y]) => (
          <circle key={x} className="mv-pc-term-pt" cx={x} cy={y} r="6" />
        ))}
        <text className="mv-pc-term-tx" x="24" y="198" textAnchor="start">Mandou o CPF</text>
        <text className="mv-pc-term-tx" x="254" y="198" textAnchor="middle">Alguns minutos</text>
        <text className="mv-pc-term-tx" x="494" y="198" textAnchor="middle">Algumas horas</text>
        <text className="mv-pc-term-tx" x="744" y="198" textAnchor="end">No dia seguinte</text>
      </svg>
      </div>
      <div className="mv-pc-term-grade">
        {MOMENTOS.map((m) => (
          <div key={m.t} data-z={m.z}><b>{m.t}</b><span>{m.d}</span></div>
        ))}
      </div>
    </Figura>
  );
}

/* ===================================================================== anatomia da primeira mensagem */
const PARTES = [
  { t: 'Olá, Dona Maria!', n: 'Cumprimento com o nome do cliente', d: 'Chamar pelo nome mostra que existe uma pessoa de verdade do outro lado, que leu a conversa.' },
  { t: 'Aqui é [seu nome], da CAF, a Central de Assessoria Financeira.', n: 'Seu nome + CAF', d: 'Ele acabou de falar com mensagens automáticas. Saber quem é você dá confiança; “CAF” liga você ao anúncio e às boas-vindas que ele viu.' },
  { t: 'Já recebi seu nome e seu CPF, não precisa mandar de novo. A partir de agora sou eu que cuido da sua análise.', n: 'A ponte com o robô', d: 'Mostra que a conversa continua de onde parou. Nada de repetir pergunta.' },
  { t: 'Pra começar, me conta: a senhora recebe algum benefício do INSS?', n: 'Uma pergunta só, fácil de responder', d: 'É a pergunta que faz a conversa andar. E já é a primeira pergunta do roteiro.' },
];
export function AnatomiaMensagem() {
  const [ativa, setAtiva] = useState<number | null>(null);
  return (
    <Figura legenda="Toque em cada parte para destacá-la na mensagem. Sugestão de roteiro: adapte ao cliente.">
      <div className="mv-pc-anat" data-ativa={ativa !== null ? '' : undefined}>
        <div className="mv-pc-anat-bolha">
          <span className="mv-pc-anat-quem">Você · primeira mensagem</span>
          <p>
            {PARTES.map((p, i) => (
              <span key={p.n}>
                {i > 0 && ' '}
                <span className="mv-pc-anat-tr" data-ativa={ativa === i ? '' : undefined}><sup>{i + 1}</sup>{p.t}</span>
              </span>
            ))}
          </p>
        </div>
        <ol className="mv-pc-anat-leg" aria-label="As quatro partes da primeira mensagem">
          {PARTES.map((p, i) => (
            <li key={p.n}>
              <button type="button" aria-pressed={ativa === i} onClick={() => setAtiva(ativa === i ? null : i)}>
                <span className="mv-pc-anat-n num">{i + 1}</span>
                <span><b>{p.n}</b><small>{p.d}</small></span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </Figura>
  );
}

/* ===================================================================== as perguntas do roteiro */
const PERGUNTAS = [
  {
    q: '“Você recebe algum benefício do INSS?”', forma: 'fechada',
    pq: 'É a primeira porta. O nosso trabalho é com empréstimos ligados a um benefício do INSS. O público principal é aposentado e pensionista (é para eles que o anúncio fala), mas qualquer benefício do INSS serve: aposentadoria, pensão, auxílio, BPC/LOAS.',
    se: <><b>Se não recebe:</b> pergunte se algum familiar recebe (pai, mãe, avó, avô, filho). CLT ou servidor público sem benefício do INSS, e sem familiar que receba, não é elegível.</>, tom: 'rubro',
  },
  {
    q: '“Qual é o benefício?”', forma: 'fechada',
    pq: 'Não é filtro: qualquer benefício do INSS serve. Mas você passa a saber com quem está falando e já prepara o caminho dos documentos (a carta de concessão mostra qual é o benefício).',
    se: <><b>Se não sabe dizer:</b> tudo bem, siga em frente. Os documentos do Meu INSS vão mostrar.</>, tom: 'neutro',
  },
  {
    q: '“Você tem empréstimo em algum destes bancos: Agibank, BMG, Facta, Mercantil ou Crefisa?”', forma: 'fechada',
    pq: 'É a outra porta: só trabalhamos com essas 5 financeiras. As que mais chegam até a gente são Agibank, Mercantil e BMG. Citar os nomes ajuda o cliente a lembrar.',
    se: <><b>Nenhuma das 5:</b> não elegível (“só trabalhamos com essas”). <b>Não sabe:</b> pergunte de novo, uma vez; se seguir sem saber, siga em frente.</>, tom: 'rubro',
  },
  {
    q: '“E me conta: o que você está buscando hoje?”', forma: 'aberta',
    pq: 'Descobre se ele quer revisar os juros, um empréstimo ou os dois. Isso muda toda a conversa de venda: quem quer revisar já está pronto para ouvir sobre o processo; quem quer empréstimo precisa primeiro ser ouvido e entender os caminhos.',
    se: <><b>Não é filtro.</b> Às vezes quem veio pelo canal de juros também precisa de dinheiro, e quem veio pelo de empréstimo nem sabia que dava para revisar. Se a resposta vier vaga, ofereça as opções.</>, tom: 'neutro',
  },
];
export function PerguntasRoteiro() {
  return (
    <div className="mv-pc-pergs">
      {PERGUNTAS.map((p, i) => (
        <article key={p.q} className="vidro mv-pc-perg">
          <div className="mv-pc-perg-cab">
            <span className="mv-pc-perg-n num">{i + 1}</span>
            <span className="mv-pc-forma" data-forma={p.forma}>Pergunta {p.forma}</span>
          </div>
          <div className="mv-pc-perg-q">{p.q}</div>
          <div className="mv-pc-perg-pq"><b>Por que perguntar:</b> {p.pq}</div>
          <div className="mv-pc-perg-se" data-tom={p.tom}>{p.se}</div>
        </article>
      ))}
    </div>
  );
}

/* ===================================================================== funil de qualificação */
const NIVEIS: { t: string; s: string; w: number; lado?: { tom?: 'rubro'; tx: ReactNode } }[] = [
  { t: 'Todo mundo que chamou', s: 'Viu o anúncio e respondeu ao robô', w: 100 },
  { t: 'Recebe benefício do INSS', s: 'Ele mesmo ou um familiar: pai, mãe, avó, avô, filho', w: 88, lado: { tom: 'rubro', tx: <><b>Sai:</b> ninguém da família recebe do INSS. Agradeça e encerre.</> } },
  { t: 'Tem empréstimo em uma das 5', s: 'Agibank · BMG · Facta · Mercantil · Crefisa', w: 76, lado: { tom: 'rubro', tx: <><b>Sai:</b> nenhuma das 5 (“só trabalhamos com essas”). Encerre com carinho.</> } },
  { t: 'Sabemos o que ele quer', s: 'Revisar os juros, um empréstimo, ou os dois', w: 64, lado: { tx: 'Não é filtro: muda o rumo da conversa de venda.' } },
  { t: 'Sabemos a dor', s: 'Desconto alto, dinheiro que não sobra, dívidas', w: 52, lado: { tx: 'Não é filtro: é o que vai fazer sentido para ele depois.' } },
];
export function FunilQualificacao() {
  return (
    <Figura legenda="O funil da qualificação: a cada pergunta fica mais claro quem pode seguir e o que cada um precisa. À direita, quem sai e por quê.">
      <div className="mv-pc-funil" role="list" aria-label="Etapas do funil de qualificação">
        {NIVEIS.map((n, i) => (
          <div key={n.t} className="mv-pc-funil-lin" role="listitem">
            <div className="mv-pc-funil-barra" data-n={i + 1} style={{ width: `${n.w}%` }}>
              <b>{n.t}</b><small>{n.s}</small>
            </div>
            {n.lado ? <div className="mv-pc-funil-lado" data-tom={n.lado.tom}>{n.lado.tx}</div> : <div aria-hidden />}
          </div>
        ))}
        <div className="mv-pc-funil-lin" role="listitem">
          <div className="mv-pc-funil-barra" data-fim="" style={{ width: '42%' }}>
            <b>Qualificado</b><small>Segue para a conversa de venda</small>
          </div>
          <div aria-hidden />
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== fluxograma do roteiro */
function Caixa({ x, y, w, h, t, s, tom, rx = 10 }: { x: number; y: number; w: number; h: number; t: string; s?: string; tom?: string; rx?: number }) {
  const cx = x + w / 2;
  return (
    <g>
      <rect className="mv-pc-fx-no" data-tom={tom} x={x} y={y} width={w} height={h} rx={rx} />
      <text className="mv-pc-fx-t" x={cx} y={s ? y + h / 2 - 3 : y + h / 2 + 4.5} textAnchor="middle">{t}</text>
      {s && <text className="mv-pc-fx-s" x={cx} y={y + h / 2 + 14} textAnchor="middle">{s}</text>}
    </g>
  );
}
function Fio({ d }: { d: string }) {
  return <path className="mv-pc-fx-fio" d={d} markerEnd="url(#mv-pc-ponta)" />;
}
function Rotulo({ x, y, t, tom, anchor = 'middle' }: { x: number; y: number; t: string; tom: 'sim' | 'nao' | 'talvez' | 'neutro'; anchor?: 'start' | 'middle' | 'end' }) {
  return <text className="mv-pc-fx-l" data-tom={tom} x={x} y={y} textAnchor={anchor}>{t}</text>;
}
export function FluxogramaRoteiro() {
  return (
    <Figura legenda="O roteiro de qualificação inteiro, como um mapa. Em verde, o caminho de quem segue; em vermelho, quem não é elegível.">
      <span className="mv-pc-rolo-dica">Arraste para o lado para ver o mapa inteiro.</span>
      <div className="mv-pc-rolo">
        <svg viewBox="0 0 760 640" role="img" aria-label="Fluxograma do roteiro: 1, recebe benefício do INSS? Se não, algum familiar recebe? Se ninguém recebe, não elegível. 2, qual é o benefício. 3, tem empréstimo em uma das 5 financeiras? Se não, não elegível; se não sabe, pergunte de novo uma vez e siga. 4, o que ele quer. 5, qual é a dor. Fim: qualificado, segue para a conversa de venda.">
          <defs>
            <marker id="mv-pc-ponta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className="mv-pc-fx-ponta" d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>

          {/* início */}
          <Caixa x={110} y={10} w={200} h={36} rx={18} tom="azul" t="Você assumiu a conversa" />
          <Fio d="M210,46 L210,77" />

          {/* 1 — benefício */}
          <Caixa x={30} y={80} w={360} h={60} t="1. Recebe algum benefício do INSS?" s="aposentadoria, pensão, auxílio ou BPC/LOAS" />
          <Fio d="M390,110 L447,110" />
          <Rotulo x={419} y={103} t="Não" tom="nao" />
          <Caixa x={450} y={80} w={290} h={60} t="Algum familiar recebe do INSS?" s="pai, mãe, avó, avô ou filho" />
          <Fio d="M640,140 L640,175" />
          <Rotulo x={648} y={163} t="Não" tom="nao" anchor="start" />
          <Caixa x={450} y={178} w={290} h={50} tom="rubro" t="Não elegível" s="agradece com carinho e encerra" />
          <Fio d="M466,140 L396,193" />
          <Rotulo x={440} y={170} t="Sim" tom="sim" anchor="start" />
          <Fio d="M210,140 L210,169" />
          <Rotulo x={218} y={160} t="Sim" tom="sim" anchor="start" />

          {/* 2 — qual benefício */}
          <Caixa x={30} y={172} w={360} h={52} t="2. Qual é o benefício?" s="dele ou do familiar · qualquer um do INSS serve" />
          <Fio d="M210,224 L210,255" />

          {/* 3 — financeira */}
          <Caixa x={30} y={258} w={360} h={64} t="3. Tem empréstimo em uma das 5 financeiras?" s="Agibank · BMG · Facta · Mercantil · Crefisa" />
          <Fio d="M390,280 L447,280" />
          <Rotulo x={419} y={273} t="Não" tom="nao" />
          <Caixa x={450} y={258} w={290} h={50} tom="rubro" t="Não elegível" s="“só trabalhamos com essas 5”" />
          <Fio d="M372,322 L372,352 L447,352" />
          <Rotulo x={411} y={345} t="Não sabe" tom="talvez" />
          <Caixa x={450} y={326} w={290} h={64} tom="ambar" t="Pergunte de novo, uma vez só" s="citando as 5 financeiras pelo nome" />
          <Fio d="M595,390 L595,436 L393,436" />
          <Rotulo x={603} y={411} t="tem numa das 5, ou" tom="neutro" anchor="start" />
          <Rotulo x={603} y={427} t="seguiu sem saber" tom="neutro" anchor="start" />
          <Rotulo x={494} y={429} t="segue em frente" tom="neutro" />
          <Fio d="M210,322 L210,407" />
          <Rotulo x={218} y={368} t="Sim" tom="sim" anchor="start" />

          {/* 4 — o que quer */}
          <Caixa x={30} y={410} w={360} h={52} t="4. O que ele quer?" s="revisar os juros, um empréstimo, ou os dois" />
          <Fio d="M210,462 L210,491" />

          {/* 5 — dor */}
          <Caixa x={30} y={494} w={360} h={52} t="5. Escute: qual é a dor?" s="desconto alto · dinheiro que não sobra · dívidas" />
          <Fio d="M210,546 L210,575" />

          {/* fim */}
          <Caixa x={30} y={578} w={360} h={48} rx={24} tom="verde" t="Qualificado: siga para a conversa de venda" />

          {/* nota do canal de empréstimo */}
          <rect className="mv-pc-fx-no" data-tom="nota" x={450} y={472} width={290} height={112} rx={10} />
          <text className="mv-pc-fx-t" x={466} y={498}>Canal de empréstimo</text>
          <text className="mv-pc-fx-s" x={466} y={522}>A IA já fez as perguntas 1 e 3</text>
          <text className="mv-pc-fx-s" x={466} y={540}>(e a do familiar). Leia as respostas</text>
          <text className="mv-pc-fx-s" x={466} y={558}>na conversa e não repita: confirme</text>
          <text className="mv-pc-fx-s" x={466} y={576}>só o que ficou em aberto.</text>
        </svg>
      </div>
    </Figura>
  );
}

/* ===================================================================== simulador do roteiro */
type Campo = 'De quem' | 'Benefício' | 'Financeira' | 'Quer' | 'Dor';
const CAMPOS: Campo[] = ['De quem', 'Benefício', 'Financeira', 'Quer', 'Dor'];
type Resp = { r: string; vai: string; nota?: [Campo, string]; obs?: string };
type NoPergunta = { tipo: 'p'; etapa: string; titulo: string; forma: 'fechada' | 'aberta'; fala: string; porque: string; resps: Resp[] };
type NoFim = { tipo: 'f'; tom: 'verde' | 'rubro'; titulo: string; texto: string; fala?: string };
const ARVORE: Record<string, NoPergunta | NoFim> = {
  beneficio: {
    tipo: 'p', etapa: 'Pergunta 1', titulo: 'Recebe algum benefício do INSS?', forma: 'fechada',
    fala: 'Pra começar, me conta: você recebe algum benefício do INSS? Pode ser aposentadoria, pensão, auxílio ou BPC/LOAS.',
    porque: 'É a primeira porta. Qualquer benefício do INSS serve.',
    resps: [
      { r: 'Sim, recebe', vai: 'qual', nota: ['De quem', 'Do próprio cliente'] },
      { r: 'Não recebe', vai: 'familiar' },
    ],
  },
  familiar: {
    tipo: 'p', etapa: 'Pergunta 1, segunda parte', titulo: 'Algum familiar recebe do INSS?', forma: 'fechada',
    fala: 'Entendi. E alguém da sua família recebe benefício do INSS? Pai, mãe, avó, avô ou filho?',
    porque: 'Antes de encerrar, veja a rota do familiar: se um familiar recebe, a análise segue pelo benefício dele.',
    resps: [
      { r: 'Sim, a mãe dele recebe', vai: 'qual', nota: ['De quem', 'Da mãe (os documentos passam a ser dela)'], obs: 'A análise segue pelo benefício da mãe. Os documentos passam a ser dela.' },
      { r: 'Não, ninguém recebe', vai: 'fimSemBeneficio', nota: ['De quem', 'Ninguém da família recebe do INSS'] },
    ],
  },
  qual: {
    tipo: 'p', etapa: 'Pergunta 2', titulo: 'Qual é o benefício?', forma: 'fechada',
    fala: 'E qual é o benefício: aposentadoria, pensão, auxílio ou BPC/LOAS?',
    porque: 'Não é filtro, qualquer um serve. Mas você passa a saber com quem está falando e prepara o caminho dos documentos.',
    resps: [
      { r: 'Aposentadoria', vai: 'financeira', nota: ['Benefício', 'Aposentadoria'] },
      { r: 'Pensão', vai: 'financeira', nota: ['Benefício', 'Pensão'] },
      { r: 'Auxílio ou BPC/LOAS', vai: 'financeira', nota: ['Benefício', 'Auxílio ou BPC/LOAS'] },
      { r: 'Não sabe dizer', vai: 'financeira', nota: ['Benefício', 'Não soube dizer (a carta de concessão vai mostrar)'], obs: 'Tudo bem: siga em frente. Os documentos do Meu INSS vão mostrar qual é.' },
    ],
  },
  financeira: {
    tipo: 'p', etapa: 'Pergunta 3', titulo: 'Tem empréstimo em uma das 5 financeiras?', forma: 'fechada',
    fala: 'E você tem empréstimo em algum destes bancos: Agibank, BMG, Facta, Mercantil ou Crefisa?',
    porque: 'É a outra porta: só trabalhamos com essas 5.',
    resps: [
      { r: 'Sim, em uma ou mais', vai: 'quer', nota: ['Financeira', 'Sim, em uma das 5'] },
      { r: 'Não, em nenhuma', vai: 'fimOutraFinanceira', nota: ['Financeira', 'Nenhuma das 5'] },
      { r: 'Não sabe', vai: 'financeira2' },
    ],
  },
  financeira2: {
    tipo: 'p', etapa: 'Pergunta 3, de novo', titulo: 'Pergunte de novo, uma vez só', forma: 'fechada',
    fala: 'Sem problema, isso é bem comum! Aparece algum desconto de Agibank, BMG, Facta, Mercantil ou Crefisa no benefício?',
    porque: 'Ouvir os nomes ajuda a lembrar. Se ele tiver por perto o papel do contrato ou o extrato do benefício, às vezes o nome do banco aparece ali.',
    resps: [
      { r: 'Lembrou: tem sim', vai: 'quer', nota: ['Financeira', 'Sim (lembrou na segunda pergunta)'] },
      { r: 'Lembrou: não tem', vai: 'fimOutraFinanceira', nota: ['Financeira', 'Nenhuma das 5 (lembrou na segunda pergunta)'] },
      { r: 'Continua sem saber', vai: 'quer', nota: ['Financeira', 'Não sabe: conferir no extrato do Meu INSS'], obs: 'Siga em frente, sem insistir: o extrato de empréstimos do Meu INSS vai mostrar cada contrato.' },
    ],
  },
  quer: {
    tipo: 'p', etapa: 'Pergunta 4', titulo: 'O que ele quer?', forma: 'aberta',
    fala: 'E me conta: o que você está buscando hoje?',
    porque: 'Deixe ele dizer com as palavras dele. Se vier vago, ofereça as opções: revisar os juros, um empréstimo, ou os dois. A resposta muda toda a conversa de venda.',
    resps: [
      { r: '“Quero revisar os juros”', vai: 'dor', nota: ['Quer', 'Revisar os juros'] },
      { r: '“Quero um empréstimo”', vai: 'dor', nota: ['Quer', 'Empréstimo (dinheiro rápido)'], obs: 'Não prometa valor: a verificação vem depois, com os extratos. Primeiro, escute.' },
      { r: '“Os dois”', vai: 'dor', nota: ['Quer', 'Revisar e conseguir um valor'] },
    ],
  },
  dor: {
    tipo: 'p', etapa: 'Escuta', titulo: 'Qual é a dor?', forma: 'aberta',
    fala: 'E como esses descontos estão pesando no seu mês?',
    porque: 'Deixe a pessoa contar, sem interromper. A dor é o que vai fazer sentido na sua explicação depois. Anote com as palavras dela.',
    resps: [
      { r: '“O desconto está muito alto”', vai: 'fimQualificado', nota: ['Dor', '“O desconto está muito alto”'] },
      { r: '“No fim do mês não sobra nada”', vai: 'fimQualificado', nota: ['Dor', '“No fim do mês não sobra nada”'] },
      { r: '“Estou cheio de dívidas”', vai: 'fimQualificado', nota: ['Dor', '“Estou cheio de dívidas”'] },
    ],
  },
  fimQualificado: {
    tipo: 'f', tom: 'verde', titulo: 'Cliente qualificado',
    texto: 'Confira a ficha ao lado: é isso que você anota. Agora siga para a conversa de venda, falando da dor que ele contou, com as palavras dele.',
  },
  fimSemBeneficio: {
    tipo: 'f', tom: 'rubro', titulo: 'Não elegível: ninguém recebe do INSS',
    texto: 'Agradeça com carinho e encerre, sem insistir. Como encerrar bem, com a mensagem pronta, está na lição 4.',
  },
  fimOutraFinanceira: {
    tipo: 'f', tom: 'rubro', titulo: 'Não elegível: nenhuma das 5 financeiras',
    texto: 'Explique com gentileza que só trabalhamos com essas 5, agradeça e encerre, sem insistir. A mensagem pronta está na lição 4.',
  },
};
const etapaDe = (id: string) => { const n = ARVORE[id]; return n.tipo === 'p' ? n.etapa : ''; };

export function SimuladorRoteiro() {
  const [hist, setHist] = useState<{ de: string; r: Resp }[]>([]);
  const [copiou, setCopiou] = useState(false);
  const atualId = hist.length ? hist[hist.length - 1].r.vai : 'beneficio';
  const no = ARVORE[atualId];
  const ficha: Partial<Record<Campo, string>> = {};
  for (const h of hist) if (h.r.nota) ficha[h.r.nota[0]] = h.r.nota[1];
  const obs = hist.length ? hist[hist.length - 1].r.obs : undefined;

  function responder(r: Resp) { setHist((h) => [...h, { de: atualId, r }]); setCopiou(false); }
  function voltar() { setHist((h) => h.slice(0, -1)); setCopiou(false); }
  function recomecar() { setHist([]); setCopiou(false); }
  async function aoCopiar(t: string) {
    if (await copiar(t)) { setCopiou(true); window.setTimeout(() => setCopiou(false), 1500); }
  }

  return (
    <div className="vidro mv-pc-sim">
      <div className="mv-pc-sim-cab">
        <div><span className="mv-tag">Treino</span><b>Simulador do roteiro</b></div>
        <div className="mv-pc-sim-bts">
          <button type="button" className="mv-link" onClick={voltar} disabled={!hist.length}>Voltar um passo</button>
          <button type="button" className="mv-link" onClick={recomecar} disabled={!hist.length}>Recomeçar</button>
        </div>
      </div>

      <div className="mv-pc-sim-corpo">
        <div className="mv-pc-sim-no" aria-live="polite">
          {obs && <div className="mv-pc-sim-obs">{obs}</div>}
          {no.tipo === 'p' ? (
            <>
              <span className="mv-pc-sim-etapa">{no.etapa}<span className="mv-pc-forma" data-forma={no.forma}>Pergunta {no.forma}</span></span>
              <b className="mv-pc-sim-tit">{no.titulo}</b>
              <div className="mv-pc-sim-fala">
                <small>Sugestão do que escrever</small>
                <span>{no.fala}</span>
                <button type="button" className="mv-pc-sim-cp" onClick={() => aoCopiar(no.fala)}>{copiou ? 'Copiado' : 'Copiar'}</button>
              </div>
              <span className="mv-pc-sim-pq"><b>Por quê:</b> {no.porque}</span>
              <div className="mv-pc-sim-resps" role="group" aria-label="O que o cliente respondeu?">
                <span>O que o cliente respondeu?</span>
                {no.resps.map((r) => (
                  <button key={r.r} type="button" className="mv-pc-bt" onClick={() => responder(r)}>{r.r}</button>
                ))}
              </div>
            </>
          ) : (
            <div className="mv-pc-sim-fim" data-tom={no.tom}>
              <b>{no.titulo}</b>
              <span>{no.texto}</span>
              {no.fala && (
                <div className="mv-pc-sim-fala">
                  <small>Sugestão do que escrever</small>
                  <span>{no.fala}</span>
                  <button type="button" className="mv-pc-sim-cp" onClick={() => no.fala && aoCopiar(no.fala)}>{copiou ? 'Copiado' : 'Copiar'}</button>
                </div>
              )}
              <button type="button" className="mv-pc-bt" onClick={recomecar}>Treinar outro caminho</button>
            </div>
          )}
        </div>

        <aside className="mv-pc-sim-ficha" aria-label="Sua anotação sobre o cliente">
          <small>Sua anotação</small>
          <dl>
            {CAMPOS.map((c) => (
              <div key={c}><dt>{c}</dt><dd data-vazio={ficha[c] ? undefined : ''}>{ficha[c] ?? '—'}</dd></div>
            ))}
          </dl>
        </aside>
      </div>

      {hist.length > 0 && (
        <ol className="mv-pc-sim-trilha" aria-label="Caminho até aqui">
          {hist.map((h, i) => <li key={i}><b>{etapaDe(h.de)}:</b> {h.r.r}</li>)}
        </ol>
      )}
    </div>
  );
}

/* ===================================================================== perguntas abertas × fechadas */
const FRASES = [
  { f: '“Você recebe algum benefício do INSS?”', aberta: false, e: 'A resposta é sim ou não. Ótima para confirmar um fato.' },
  { f: '“Me conta: como esses descontos estão pesando no seu mês?”', aberta: true, e: 'Convida a pessoa a contar. É assim que a dor aparece.' },
  { f: '“O empréstimo é no BMG?”', aberta: false, e: 'Sim ou não. Serve para confirmar o banco.' },
  { f: '“Como foi que esses empréstimos começaram?”', aberta: true, e: 'A pessoa conta a história, e você descobre coisas que nem sabia perguntar.' },
  { f: '“É aposentadoria ou pensão?”', aberta: false, e: 'É uma escolha entre opções: continua sendo fechada.' },
  { f: '“O que você gostaria que mudasse no seu benefício?”', aberta: true, e: 'Mostra o que a pessoa quer de verdade, com as palavras dela.' },
];
export function AbertaFechada() {
  const [resp, setResp] = useState<Record<number, boolean>>({});
  const feitas = Object.keys(resp).length;
  const acertos = FRASES.filter((f, i) => resp[i] === f.aberta).length;
  return (
    <div className="mv-pc-af">
      <div className="mv-pc-af-tipos">
        <div className="vidro mv-pc-af-tipo" data-tipo="fechada">
          <div className="mv-pc-af-topo"><h4>Pergunta fechada</h4><div className="mv-pc-af-vis" aria-hidden><span>Sim</span><span>Não</span></div></div>
          <div className="mv-pc-af-def">A resposta é curta: <b>sim, não, ou uma escolha</b> entre opções.</div>
          <ul className="mv-pc-af-ex"><li>“Você recebe algum benefício do INSS?”</li><li>“É aposentadoria ou pensão?”</li></ul>
          <div className="mv-pc-af-uso">
            <span><b>Use para:</b> confirmar fatos (benefício, qual benefício, qual banco).</span>
            <span><b>Cuidado:</b> só fechadas viram interrogatório. Parece um formulário.</span>
          </div>
        </div>
        <div className="vidro mv-pc-af-tipo" data-tipo="aberta">
          <div className="mv-pc-af-topo"><h4>Pergunta aberta</h4><div className="mv-pc-af-vis" data-aberta="" aria-hidden><i /><i /><i /></div></div>
          <div className="mv-pc-af-def">A pessoa responde <b>contando</b>, com as palavras dela.</div>
          <ul className="mv-pc-af-ex"><li>“Me conta: como esses descontos estão pesando no seu mês?”</li><li>“O que você está buscando hoje?”</li></ul>
          <div className="mv-pc-af-uso">
            <span><b>Use para:</b> descobrir a dor, o que ela quer e o que sente.</span>
            <span><b>Cuidado:</b> faça curta e simples. Só abertas e a conversa não anda.</span>
          </div>
        </div>
      </div>

      <div className="vidro mv-pc-af-jogo">
        <div className="mv-pc-af-jcab">
          <div><span className="mv-tag">Treino</span><b>Aberta ou fechada?</b></div>
          {feitas === FRASES.length
            ? <span className="num">{acertos} de {FRASES.length} acertos · <button type="button" className="mv-link" onClick={() => setResp({})}>Jogar de novo</button></span>
            : <span className="num">{feitas} de {FRASES.length} respondidas</span>}
        </div>
        {FRASES.map((f, i) => {
          const r = resp[i];
          const respondeu = r !== undefined;
          return (
            <div key={f.f} className="mv-pc-af-it" data-estado={!respondeu ? undefined : r === f.aberta ? 'certo' : 'errado'}>
              <span className="mv-pc-af-q">{f.f}</span>
              {!respondeu ? (
                <div className="mv-pc-af-bts">
                  <button type="button" className="mv-pc-bt" onClick={() => setResp((x) => ({ ...x, [i]: false }))}>Fechada</button>
                  <button type="button" className="mv-pc-bt" data-tom="verde" onClick={() => setResp((x) => ({ ...x, [i]: true }))}>Aberta</button>
                </div>
              ) : (
                <span className="mv-pc-af-r"><b>{r === f.aberta ? 'Acertou:' : 'Não:'}</b> é {f.aberta ? 'aberta' : 'fechada'}. {f.e}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===================================================================== iceberg da dor */
const DORES = ['O desconto está alto demais', 'No fim do mês não sobra nada', 'Estou cheio(a) de dívidas', 'Tenho medo de cair em golpe', 'Sinto que fui enganado(a)'];
export function Iceberg() {
  return (
    <Figura legenda="O que o cliente diz é a ponta. A dor, o motivo de verdade, fica por baixo, e só aparece quando você pergunta e escuta.">
      <span className="mv-pc-rolo-dica">Arraste para o lado para ver a imagem inteira.</span>
      <div className="mv-pc-rolo">
        <svg viewBox="0 0 760 370" role="img" aria-label="Iceberg: acima da água, o que o cliente diz (quero revisar os meus juros, quero um empréstimo). Abaixo da água, o que ele sente: o desconto está alto demais, no fim do mês não sobra nada, estou cheio de dívidas, tenho medo de cair em golpe, sinto que fui enganado.">
          <rect className="mv-pc-ice-agua" x="0" y="118" width="760" height="252" />
          <polygon className="mv-pc-ice-massa" points="262,118 500,118 556,176 584,252 528,330 392,356 252,326 186,250 208,170" />
          <polygon className="mv-pc-ice-ponta" points="300,118 342,48 384,26 428,56 466,118" />
          <path className="mv-pc-ice-linha" d="M0,118 L760,118" />

          <text className="mv-pc-ice-cab" x="24" y="30">O QUE ELE DIZ</text>
          <rect className="mv-pc-ice-diz" x="24" y="48" width="250" height="34" rx="17" />
          <text className="mv-pc-ice-tx" x="149" y="69.5" textAnchor="middle">“Quero revisar os meus juros.”</text>
          <rect className="mv-pc-ice-diz" x="486" y="48" width="250" height="34" rx="17" />
          <text className="mv-pc-ice-tx" x="611" y="69.5" textAnchor="middle">“Quero um empréstimo.”</text>

          <text className="mv-pc-ice-cab" x="24" y="146">O QUE ELE SENTE: A DOR</text>
          {DORES.map((d, i) => {
            const y = 150 + i * 34;
            return (
              <g key={d}>
                <rect className="mv-pc-ice-dor" x="266" y={y} width="236" height="28" rx="8" />
                <text className="mv-pc-ice-tx" x="384" y={y + 18.5} textAnchor="middle">{d}</text>
              </g>
            );
          })}
          <text className="mv-pc-ice-nota" x="24" y="200">A escuta ativa leva</text>
          <text className="mv-pc-ice-nota" x="24" y="218">você até aqui embaixo.</text>
          <text className="mv-pc-ice-nota" x="600" y="190">Por baixo da água</text>
          <text className="mv-pc-ice-nota" x="600" y="208">está o motivo de</text>
          <text className="mv-pc-ice-nota" x="600" y="226">verdade. É ele que</text>
          <text className="mv-pc-ice-nota" x="600" y="244">faz o cliente decidir.</text>
        </svg>
      </div>
    </Figura>
  );
}

/* ===================================================================== as quatro atitudes da escuta */
const ATITUDES = [
  { t: 'Deixe terminar', d: 'Não interrompa nem responda no meio. Se ele manda várias mensagens seguidas, espere ele parar.', ex: 'Espere a última mensagem chegar.' },
  { t: 'Repita com suas palavras', d: 'Mostra que você entendeu e corrige um mal-entendido na hora.', ex: '“Então, se eu entendi bem…”' },
  { t: 'Valide o sentimento', d: 'Reconheça o que ele sente antes de explicar qualquer coisa.', ex: '“Imagino como isso aperta.”' },
  { t: 'Anote', d: 'Com as palavras dele. Você vai usar na explicação, e ninguém precisa perguntar de novo.', ex: '“Todo mês vem menos.”' },
];
export function AtitudesEscuta() {
  return (
    <div className="mv-pc-tec">
      {ATITUDES.map((a, i) => (
        <div key={a.t} className="vidro">
          <span className="mv-pc-tec-n num">{i + 1}</span>
          <b>{a.t}</b>
          <span className="mv-pc-tec-d">{a.d}</span>
          <em>{a.ex}</em>
        </div>
      ))}
    </div>
  );
}

/* ===================================================================== ficha de anotação */
const FICHA: { c: string; v: string; dor?: boolean }[] = [
  { c: 'Cliente', v: 'Dona Cida (exemplo)' },
  { c: 'Canal', v: 'Juros abusivos' },
  { c: 'Benefício', v: 'Aposentadoria, dela mesma' },
  { c: 'Financeiras', v: 'BMG e Agibank (acha que tem mais um)' },
  { c: 'O que quer', v: 'Revisar os juros' },
  { c: 'A dor, nas palavras dela', v: '“Todo mês vem menos e eu tô devendo a farmácia.”', dor: true },
  { c: 'Família', v: 'A filha ajuda com o celular, à noite' },
  { c: 'Próximo passo', v: 'Explicar o processo hoje à noite, com a filha junto' },
];
export function FichaAnotacao() {
  return (
    <Figura legenda="Exemplo de anotação depois do primeiro contato. Anote no lugar que o seu gestor indicar.">
      <div className="mv-pc-ficha">
        <div className="mv-pc-ficha-papel">
          <header><b>Anotação do primeiro contato</b><small>exemplo</small></header>
          <dl>
            {FICHA.map((l) => (
              <div key={l.c} data-dor={l.dor ? '' : undefined}><dt>{l.c}</dt><dd>{l.v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="mv-pc-ficha-pq">
          <b>Por que anotar</b>
          <ul>
            <li><b>Você não vai lembrar.</b> No meio de várias conversas, os detalhes se misturam.</li>
            <li><b>Ninguém pergunta de novo.</b> Se outra pessoa pegar a conversa, está tudo ali.</li>
            <li><b>A dor vira argumento.</b> Na hora de explicar, você usa as palavras do próprio cliente.</li>
            <li><b>O próximo passo não se perde.</b> Combinou de falar à noite com a filha? Está escrito.</li>
          </ul>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== anatomia do áudio */
const SEGMENTOS = [
  { s: 1, t: 'Cumprimente pelo nome', ex: '“Oi, Dona Maria, tudo bem?”', barras: 12 },
  { s: 2, t: 'Diga quem você é', ex: '“Aqui é [seu nome], da CAF.”', barras: 12 },
  { s: 3, t: 'Uma ideia só', ex: '“Ouvi seu áudio e entendi que os descontos estão apertando o seu mês…”', barras: 28 },
  { s: 4, t: 'Termine com uma pergunta', ex: '“Além do BMG, tem desconto de outro banco?”', barras: 12 },
];
/* alturas fixas (determinísticas) da "onda" do áudio, em % */
const altura = (i: number) => Math.round(28 + 66 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)));
export function AnatomiaAudio() {
  let k = 0;
  return (
    <Figura legenda="Um bom áudio tem quatro partes, nesta ordem. Curto, calmo e com uma pergunta no final. Sugestão: adapte ao cliente.">
      <div className="mv-pc-aud">
        <div className="mv-pc-aud-bolha" aria-hidden>
          <span className="mv-pc-aud-play" />
          <div className="mv-pc-aud-onda">
            {SEGMENTOS.map((g) => (
              <div key={g.s} className="mv-pc-aud-seg" data-s={g.s} style={{ flexGrow: g.barras }}>
                {Array.from({ length: g.barras }, () => { k += 1; return <i key={k} style={{ height: `${altura(k)}%` }} />; })}
              </div>
            ))}
          </div>
          <span className="mv-pc-aud-dur">curto</span>
        </div>
        <div className="mv-pc-aud-segs">
          {SEGMENTOS.map((g) => (
            <div key={g.s} data-s={g.s}><b>{g.s}. {g.t}</b><span>{g.ex}</span></div>
          ))}
        </div>
        <div className="mv-pc-aud-ex">
          <small>Exemplo do áudio inteiro</small>
          “Oi, Dona Maria, tudo bem? Aqui é [seu nome], da CAF. Ouvi o seu áudio todinho, obrigado(a) por me contar.
          Pelo que entendi, a senhora tem empréstimo no BMG e os descontos estão apertando o seu mês. Pra eu te ajudar
          direitinho, me conta: além do BMG, tem desconto de algum outro banco no seu benefício?”
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== erros clássicos */
type Erro = { id: string; nome: string; resumo: string; contato: string; ruim: Bolha[]; bom: Bolha[]; porque: string };
const ERROS: Erro[] = [
  {
    id: 'pressa', nome: 'Pressa', contato: 'Dona Lourdes',
    resumo: 'Pular etapas: ir direto para os documentos (ou para o fechamento) antes de qualificar, escutar e explicar.',
    ruim: [
      { de: 'cliente', texto: 'Boa tarde. Eu queria entender melhor como funciona isso aí.', hora: '15:10' },
      { de: 'eu', texto: 'Boa tarde. Manda foto do RG, do comprovante de residência e o seu e-mail.', hora: '15:11' },
      { de: 'cliente', texto: 'Mas eu nem sei ainda do que se trata…', hora: '15:14' },
    ],
    bom: [
      { de: 'cliente', texto: 'Boa tarde. Eu queria entender melhor como funciona isso aí.', hora: '15:10' },
      { de: 'eu', texto: 'Boa tarde, Dona Lourdes! Claro, eu te explico com calma, sem pressa nenhuma.', hora: '15:11' },
      { de: 'eu', texto: 'Antes, me conta uma coisa: a senhora recebe algum benefício do INSS?', hora: '15:11' },
      { de: 'cliente', texto: 'Recebo, sou aposentada.', hora: '15:12' },
    ],
    porque: 'Pedir documento para quem ainda nem entendeu o serviço assusta e parece golpe. A pressa também pula a qualificação: você pode acabar pedindo documentos de quem nem é elegível. Primeiro entenda o cliente; os documentos vêm depois que ele topar.',
  },
  {
    id: 'jargao', nome: 'Jargão', contato: 'Seu Jorge',
    resumo: 'Usar palavras técnicas da nossa área, que o cliente não conhece.',
    ruim: [
      { de: 'eu', texto: 'Qual a espécie do seu benefício? E tem contrato consignado averbado com qual IF?', hora: '09:20' },
      { de: 'cliente', texto: 'Desculpa, não entendi 😕', hora: '09:26' },
    ],
    bom: [
      { de: 'eu', texto: 'O senhor recebe aposentadoria, pensão ou outro benefício do INSS?', hora: '09:20' },
      { de: 'cliente', texto: 'Aposentadoria.', hora: '09:21' },
      { de: 'eu', texto: 'Ótimo! E tem empréstimo em algum destes bancos: Agibank, BMG, Facta, Mercantil ou Crefisa?', hora: '09:21' },
      { de: 'cliente', texto: 'Tenho no Mercantil.', hora: '09:23' },
    ],
    porque: 'Quem não entende fica com vergonha de perguntar, ou desconfia. Jargão afasta, principalmente o cliente mais velho. Fale como você explicaria para a sua avó.',
  },
  {
    id: 'gigante', nome: 'Mensagem gigante', contato: 'Seu Carlos',
    resumo: 'Mandar tudo num bloco só: processo, prazos, valores e documentos de uma vez.',
    ruim: [
      { de: 'cliente', texto: 'Como funciona?', hora: '11:02' },
      { de: 'eu', texto: 'Funciona assim: o nosso advogado, o Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos, o que leva de 6 a 12 meses, e o senhor não paga nada no começo, só 30% no final, que são os honorários do advogado, tirados do que o senhor ganhar. Para isso eu preciso da carta de concessão, do extrato de consignado, dos extratos de pagamento dos últimos 10 anos, do imposto de renda dos últimos 3 anos, da situação cadastral do CPF, da sua identidade, do comprovante de residência e do seu e-mail.', hora: '11:03' },
      { de: 'cliente', texto: 'Ok, tá bom.', hora: '11:20' },
    ],
    bom: [
      { de: 'cliente', texto: 'Como funciona?', hora: '11:02' },
      { de: 'eu', texto: 'Vou te explicar por partes, tá bom?', hora: '11:03' },
      { de: 'eu', texto: 'Primeiro, a gente analisa os seus empréstimos para ver se tem cobrança de juros abusivos.', hora: '11:03' },
      { de: 'eu', texto: 'Ficou claro até aqui?', hora: '11:03' },
      { de: 'cliente', texto: 'Ficou sim, pode continuar!', hora: '11:05' },
    ],
    porque: 'Textão cansa, ainda mais no celular e para quem lê devagar. O cliente lê pela metade, responde “ok” e some, e você fica sem saber o que ele entendeu. Uma ideia por mensagem, e uma pergunta no fim para conferir.',
  },
  {
    id: 'tudo', nome: 'Tudo de uma vez', contato: 'Seu Antônio',
    resumo: 'Fazer várias perguntas na mesma mensagem.',
    ruim: [
      { de: 'eu', texto: 'Recebe benefício do INSS? Qual? Tem empréstimo em qual banco? Quanto desconta? Quer revisar ou fazer empréstimo? Tem senha do gov.br?', hora: '16:40' },
      { de: 'cliente', texto: 'Sou aposentado', hora: '16:47' },
    ],
    bom: [
      { de: 'eu', texto: 'O senhor recebe algum benefício do INSS?', hora: '16:40' },
      { de: 'cliente', texto: 'Sim, sou aposentado.', hora: '16:41' },
      { de: 'eu', texto: 'Ótimo. E tem empréstimo em algum destes bancos: Agibank, BMG, Facta, Mercantil ou Crefisa?', hora: '16:41' },
      { de: 'cliente', texto: 'Tenho no BMG.', hora: '16:43' },
    ],
    porque: 'O cliente responde uma (quase sempre a primeira) e as outras se perdem. Parece um formulário, não uma conversa. Repare no lado certo: como ele já disse “aposentado”, o atendente nem precisou perguntar qual é o benefício. Isso é escutar.',
  },
];
export function ErrosClassicos() {
  const [sel, setSel] = useState(0);
  const e = ERROS[sel];
  return (
    <div className="mv-pc-erros">
      <div className="mv-pc-abas" role="tablist" aria-label="Os quatro erros clássicos">
        {ERROS.map((x, i) => (
          <button key={x.id} type="button" role="tab" id={`mv-pc-aba-${x.id}`} aria-selected={i === sel} aria-controls="mv-pc-erro-painel"
            className="mv-pc-aba" onClick={() => setSel(i)}>
            <span className="mv-pc-aba-n num">{i + 1}</span>{x.nome}
          </button>
        ))}
      </div>
      <div className="mv-pc-erro" role="tabpanel" id="mv-pc-erro-painel" aria-labelledby={`mv-pc-aba-${e.id}`}>
        <div className="mv-pc-erro-res"><b>O erro:</b> {e.resumo}</div>
        <BomRuim
          ruim={{ titulo: 'Com o erro', corpo: <Celular key={`r-${e.id}`} contato={e.contato} sub="cliente · exemplo" bolhas={e.ruim} legenda="Como NÃO fazer" /> }}
          bom={{ titulo: 'Sem o erro', corpo: <Celular key={`b-${e.id}`} contato={e.contato} sub="cliente · exemplo" bolhas={e.bom} legenda="Como fazer" /> }}
        />
        <div className="mv-pc-erro-pq"><b>Por que é um erro:</b> {e.porque}</div>
      </div>
    </div>
  );
}

/* ===================================================================== checklist do primeiro contato */
const CHECK: { g: string; itens: string[] }[] = [
  { g: 'Antes de escrever', itens: ['Li a conversa inteira, inclusive as mensagens automáticas', 'Vi por qual canal o cliente veio (juros ou empréstimo)', 'Separei o que ele já respondeu (nome, CPF, respostas à IA)'] },
  { g: 'Apresentação', itens: ['Chamei o cliente pelo nome', 'Disse o meu nome e que sou da CAF', 'Mostrei que já recebi os dados, sem pedir de novo', 'No empréstimo: expliquei a “pré-aprovada” e pedi os extratos do Meu INSS'] },
  { g: 'Qualificação', itens: ['Confirmei o benefício do INSS (dele ou de um familiar)', 'Perguntei qual é o benefício', 'Confirmei empréstimo em Agibank, BMG, Facta, Mercantil ou Crefisa', 'Entendi se ele quer revisar, um empréstimo ou os dois'] },
  { g: 'Escuta', itens: ['Fiz pelo menos uma pergunta aberta', 'Descobri a dor e anotei com as palavras dele', 'Repeti o que entendi para confirmar'] },
  { g: 'Forma', itens: ['Uma pergunta por mensagem', 'Mensagens curtas e sem jargão', 'Áudio só quando ajuda: curto e com pergunta no final'] },
  { g: 'Saída', itens: ['Combinei o próximo passo, ou encerrei com carinho quem não é elegível', 'Não prometi valor nem resultado'] },
];
const TOTAL_CHECK = CHECK.reduce((n, g) => n + g.itens.length, 0);
export function ChecklistContato() {
  const [feitos, setFeitos] = useState<Set<string>>(() => new Set());
  function alternar(k: string) {
    setFeitos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  return (
    <div className="vidro mv-pc-chk">
      <div className="mv-pc-chk-topo">
        <div className="mv-pc-chk-prog">
          <span className="num">{feitos.size} de {TOTAL_CHECK} feitos</span>
          <div className="mv-pc-chk-barra" aria-hidden><i style={{ width: `${(feitos.size / TOTAL_CHECK) * 100}%` }} /></div>
        </div>
        <button type="button" className="mv-link" onClick={() => setFeitos(new Set())} disabled={!feitos.size}>Limpar</button>
      </div>
      <div className="mv-pc-chk-grade">
        {CHECK.map((g) => (
          <section key={g.g} className="mv-pc-chk-grupo">
            <h4>{g.g}</h4>
            {g.itens.map((it) => {
              const k = `${g.g}:${it}`;
              return (
                <button key={k} type="button" className="mv-pc-chk-it" aria-pressed={feitos.has(k)} onClick={() => alternar(k)}>
                  <span className="mv-pc-chk-cx" aria-hidden>{feitos.has(k) && <IcCheck />}</span>
                  <span>{it}</span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
      {feitos.size === TOTAL_CHECK && (
        <div className="mv-pc-chk-fim" role="status">Primeiro contato completo. Agora é seguir para a conversa de venda.</div>
      )}
      <p className="mv-calc-nota">O checklist é só um apoio para as suas primeiras conversas e não fica salvo.</p>
    </div>
  );
}
