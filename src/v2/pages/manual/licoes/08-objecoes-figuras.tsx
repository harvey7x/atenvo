/* Lição 8 — ilustrações e treinos próprios (prefixo mv-ob-): uma frase com
   vários motivos, o método de 6 passos (diagrama clicável), a anatomia de uma
   boa resposta, as cinco famílias de objeção, a caixa de fatos, os sinais de
   seriedade × sinais de golpe, a linha do tempo do pagamento, a árvore "até
   onde ir", as conversas encenadas e o treino de respostas.
   Mensagens do robô/IA: copiadas literalmente do processo oficial. Falas do
   atendente: sugestões de roteiro. Estilos em 08-objecoes.css. */
import { useState, type ReactNode } from 'react';
import { BomRuim, Celular, Figura, IcCheck, IcX, type Bolha } from '../pecas';
import { FAMILIAS, OBJECOES, type FamiliaId, type TomOb } from './08-objecoes-manual';

/* ===================================================================== rolagem dos desenhos largos */
/** Em tela estreita o desenho mantém uma largura mínima (texto legível) e rola para o lado. */
function Rolo({ children }: { children: ReactNode }) {
  return (
    <div className="mv-ob-rolo">
      <p className="mv-ob-rolo-dica">Arraste para o lado para ver o desenho inteiro.</p>
      <div className="mv-ob-rolo-area">{children}</div>
    </div>
  );
}

/* ===================================================================== uma frase, vários motivos */
const MOTIVOS = [
  { tom: 'ambar', t: 'Ficou uma dúvida que ele não falou', q: '“Ficou alguma parte que eu não expliquei bem?”' },
  { tom: 'azul', t: 'Tem medo de ser golpe', q: '“Ficou com alguma preocupação sobre a segurança?”' },
  { tom: 'verde', t: 'Quer decidir junto com a família', q: '“Quer que eu explique para alguém da sua família?”' },
  { tom: 'neutro', t: 'Não quer, mas tem vergonha de dizer não', q: '“Tudo bem se preferir não seguir. É isso?”' },
];
export function FraseMotivos() {
  return (
    <Figura legenda="A mesma frase pode ter motivos bem diferentes por trás. Cada motivo pede uma resposta diferente, por isso primeiro você pergunta.">
      <Rolo>
      <svg viewBox="0 0 760 330" role="img" aria-label="Diagrama: a frase do cliente “Vou pensar” se liga a quatro motivos possíveis — uma dúvida não dita, medo de golpe, vontade de decidir com a família ou um não educado —, cada um com a pergunta que ajuda a descobrir o motivo.">
        <text className="mv-ob-fm-rot" x="20" y="116">O cliente diz</text>
        <path className="mv-ob-fm-bolha" d="M36,128 H208 a16,16 0 0 1 16,16 V186 a16,16 0 0 1 -16,16 H60 L40,218 L44,202 H36 a16,16 0 0 1 -16,-16 V144 a16,16 0 0 1 16,-16 Z" />
        <text className="mv-ob-fm-diz" x="122" y="172" textAnchor="middle">“Vou pensar.”</text>
        <text className="mv-ob-fm-rot" x="122" y="248" textAnchor="middle">Uma frase só, mas que pode</text>
        <text className="mv-ob-fm-rot" x="122" y="266" textAnchor="middle">esconder motivos diferentes</text>
        <text className="mv-ob-fm-cab" x="300" y="26">O que pode estar por trás · e a pergunta que descobre</text>
        {MOTIVOS.map((m, i) => {
          const y = 40 + i * 72;
          return (
            <g key={m.t} data-obtom={m.tom}>
              <path className="mv-ob-fm-fio" d={`M224,165 C262,165 262,${y + 30} 300,${y + 30}`} />
              <rect className="mv-ob-fm-caixa" x="300" y={y} width="444" height="60" rx="10" />
              <rect className="mv-ob-fm-faixa" x="300" y={y} width="5" height="60" rx="2" />
              <text className="mv-ob-fm-t" x="318" y={y + 24}>{m.t}</text>
              <text className="mv-ob-fm-q" x="318" y={y + 45}>{m.q}</text>
            </g>
          );
        })}
      </svg>
      </Rolo>
    </Figura>
  );
}

/* ===================================================================== o método em 6 passos */
type Grupo = 'conexao' | 'diagnostico' | 'resposta' | 'avanco';
const GRUPO: Record<Grupo, { nome: string; tom: TomOb }> = {
  conexao: { nome: 'Conexão', tom: 'neutro' },
  diagnostico: { nome: 'Diagnóstico', tom: 'ambar' },
  resposta: { nome: 'Resposta', tom: 'azul' },
  avanco: { nome: 'Avanço', tom: 'verde' },
};
const METODO: { t: string; linhas: string[]; sub: string; grupo: Grupo; faz: string; porque: string; frase: string; erro: string }[] = [
  {
    t: 'Ouvir', linhas: ['Ouvir'], sub: 'sem interromper', grupo: 'conexao',
    faz: 'Leia a mensagem inteira, ou ouça o áudio até o fim, antes de responder. Deixe o cliente terminar, mesmo que você já saiba a resposta.',
    porque: 'Quem se sente interrompido não escuta a resposta. E muitas vezes a objeção verdadeira está no fim da mensagem, não no começo.',
    frase: 'Aqui você ainda não escreve nada: só lê tudo com atenção e repara nas palavras que o cliente usou.',
    erro: 'Colar a resposta pronta antes de o cliente terminar de explicar.',
  },
  {
    t: 'Acolher', linhas: ['Acolher'], sub: 'a dúvida é normal', grupo: 'conexao',
    faz: 'Mostre que você entendeu e que a preocupação faz sentido. Acolher não é concordar com tudo: é respeitar o que o cliente sente.',
    porque: 'Quando a pessoa se sente contrariada, ela se defende e para de ouvir. Quando se sente respeitada, ela abre espaço para a sua explicação.',
    frase: '“Entendo a sua preocupação, faz todo sentido perguntar isso.”',
    erro: '“Não, senhor, não é nada disso.” Começar contradizendo.',
  },
  {
    t: 'Entender o motivo real', linhas: ['Entender o', 'motivo real'], sub: 'pergunte o porquê', grupo: 'diagnostico',
    faz: 'Faça uma pergunta de diagnóstico: uma pergunta simples para descobrir o que está por trás da frase. Uma pergunta só, e espere a resposta.',
    porque: 'A mesma frase pode esconder motivos bem diferentes. Responder ao motivo errado é gastar a resposta, e o cliente continua com a dúvida.',
    frase: '“Posso perguntar o que deixou o senhor com essa dúvida?”',
    erro: 'Pular direto para a resposta pronta, sem saber o motivo.',
  },
  {
    t: 'Responder com fato', linhas: ['Responder', 'com fato'], sub: 'fato, sem promessa', grupo: 'resposta',
    faz: 'Responda ao motivo real com um fato verdadeiro do processo, em palavras simples. Um ou dois fatos bastam: não despeje tudo.',
    porque: 'Fato pode ser conferido e continua verdadeiro amanhã. Promessa vira cobrança, e cliente que se sente enganado não volta.',
    frase: '“O senhor não paga nada para começar. Os 30% do advogado saem do valor que o senhor receber, no final.”',
    erro: '“Pode ficar tranquilo, vai dar tudo certo.” Promessa sem fato.',
  },
  {
    t: 'Confirmar', linhas: ['Confirmar'], sub: 'ficou claro?', grupo: 'resposta',
    faz: 'Pergunte se ficou claro e se existe mais alguma dúvida. Se não ficou, volte ao passo 3 e explique de outro jeito.',
    porque: 'Muita gente responde “tá” sem ter entendido, por vergonha. Confirmar evita que a dúvida volte depois, maior.',
    frase: '“Ficou claro? Tem mais alguma coisa que preocupa o senhor?”',
    erro: 'Mandar a explicação e já pedir os documentos, sem conferir.',
  },
  {
    t: 'Próximo passo', linhas: ['Próximo', 'passo'], sub: 'combine o que vem', grupo: 'avanco',
    faz: 'Combine uma ação concreta: um documento, um horário para retomar, uma conversa com o filho.',
    porque: 'Conversa sem próximo passo esfria. Com um combinado, o cliente sabe o que fazer e você sabe quando voltar.',
    frase: '“Então o primeiro passo é um extrato do Meu INSS. Podemos fazer agora?”',
    erro: 'Terminar com “qualquer coisa me chama”.',
  },
];
const MX = [63, 190, 317, 444, 571, 698];
const BANDAS: { g: Grupo; x1: number; x2: number }[] = [
  { g: 'conexao', x1: 5, x2: 248 }, { g: 'diagnostico', x1: 259, x2: 375 },
  { g: 'resposta', x1: 386, x2: 629 }, { g: 'avanco', x1: 640, x2: 756 },
];

export function MetodoResposta() {
  const [sel, setSel] = useState(0);
  const p = METODO[sel];
  const g = GRUPO[p.grupo];
  return (
    <figure className="mv-ob-met">
      <div className="vidro mv-ob-met-corpo">
        <Rolo>
        <svg className="mv-ob-met-svg" viewBox="0 0 760 222" role="img"
          aria-label="Diagrama do método em seis passos: ouvir, acolher, entender o motivo real, responder com fato, confirmar e combinar o próximo passo. Do passo 5 sai uma seta de volta para o passo 3: se não ficou claro, volte a entender o motivo.">
          <defs>
            <marker id="mv-ob-met-seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className="mv-ob-seta-p" d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>
          <path className="mv-ob-met-volta" d="M571,68 C571,16 317,16 317,64" markerEnd="url(#mv-ob-met-seta)" />
          <rect className="mv-ob-met-pill" x="339" y="20" width="210" height="22" rx="11" />
          <text className="mv-ob-met-pt" x="444" y="35" textAnchor="middle">Não ficou claro? Volte ao 3</text>
          {MX.slice(0, -1).map((x, i) => (
            <line key={x} className="mv-ob-met-linha" x1={x + 30} y1="96" x2={MX[i + 1] - 33} y2="96" markerEnd="url(#mv-ob-met-seta)" />
          ))}
          {METODO.map((m, i) => (
            <g key={m.t} className="mv-ob-met-no" data-obtom={GRUPO[m.grupo].tom} data-sel={sel === i ? '' : undefined} onClick={() => setSel(i)}>
              <circle cx={MX[i]} cy="96" r="26" />
              <text className="mv-ob-met-num" x={MX[i]} y="101" textAnchor="middle">{i + 1}</text>
              {m.linhas.map((l, j) => (
                <text key={l} className="mv-ob-met-t" x={MX[i]} y={146 + j * 16} textAnchor="middle">{l}</text>
              ))}
              <text className="mv-ob-met-s" x={MX[i]} y="182" textAnchor="middle">{m.sub}</text>
            </g>
          ))}
          {BANDAS.map((b) => (
            <g key={b.g} data-obtom={GRUPO[b.g].tom}>
              <rect className="mv-ob-met-banda" x={b.x1} y="196" width={b.x2 - b.x1} height="22" rx="6" />
              <text className="mv-ob-met-bt" x={(b.x1 + b.x2) / 2} y="211" textAnchor="middle">{GRUPO[b.g].nome.toUpperCase()}</text>
            </g>
          ))}
        </svg>
        </Rolo>

        <div className="mv-ob-met-chips" role="group" aria-label="Escolha um passo do método">
          {METODO.map((m, i) => (
            <button key={m.t} type="button" aria-pressed={sel === i} data-obtom={GRUPO[m.grupo].tom} onClick={() => setSel(i)}>
              <span className="num">{i + 1}</span>{m.t}
            </button>
          ))}
        </div>

        <div className="mv-ob-met-painel" data-obtom={g.tom} aria-live="polite">
          <header>
            <span className="num">Passo {sel + 1} de 6</span>
            <b>{p.t}</b>
            <small>{g.nome}</small>
          </header>
          <div className="mv-ob-met-cols">
            <div>
              <h4>O que fazer</h4>
              <p>{p.faz}</p>
              <h4>Por que funciona</h4>
              <p>{p.porque}</p>
            </div>
            <div>
              <h4>Exemplo</h4>
              <p className="mv-ob-met-ex">{p.frase}</p>
              <h4 data-ruim="">Erro comum</h4>
              <p className="mv-ob-met-erro"><IcX />{p.erro}</p>
            </div>
          </div>
          <div className="mv-ob-met-nav">
            <button type="button" className="mv-link" disabled={sel === 0} onClick={() => setSel(sel - 1)}>Passo anterior</button>
            <button type="button" className="mv-link" disabled={sel === METODO.length - 1} onClick={() => setSel(sel + 1)}>Próximo passo</button>
          </div>
        </div>
      </div>
      <figcaption><span className="mv-tag">Ilustração</span>Toque em um passo (no desenho ou nos botões) para ver o que fazer, por que funciona e o erro mais comum.</figcaption>
    </figure>
  );
}

/* ===================================================================== anatomia de uma boa resposta */
type ParteConversa = { quem: 'cliente' | 'eu'; passo?: number; t: string };
const CONVERSA_ANAT: ParteConversa[] = [
  { quem: 'cliente', t: 'Vou pensar e depois te falo.' },
  { quem: 'eu', passo: 2, t: 'Claro, Dona Rosa, é uma decisão importante e é bom pensar com calma.' },
  { quem: 'eu', passo: 3, t: 'Só para eu ajudar: ficou alguma parte que eu não expliquei bem?' },
  { quem: 'cliente', t: 'É essa parte dos 30%. Vou ter que pagar isso quando?' },
  { quem: 'eu', passo: 4, t: 'Boa pergunta! A senhora não paga nada para começar. No final, do valor que a senhora receber, 30% ficam para o advogado. Se receber R$ 10.000, por exemplo, R$ 7.000 ficam com a senhora.' },
  { quem: 'eu', passo: 5, t: 'Ficou mais claro assim? Tem mais alguma coisa que a senhora queira saber?' },
  { quem: 'cliente', t: 'Agora entendi. Pode seguir.' },
  { quem: 'eu', passo: 6, t: 'Que bom! Então o primeiro passo é um extrato do Meu INSS. Posso explicar agora como pegar?' },
];
const EXPLICA_ANAT: Record<number, string> = {
  2: 'Concorda com o direito de pensar. A cliente não precisa se defender, e por isso continua conversando.',
  3: 'Uma pergunta leve, sem pressão, que abre espaço para a dúvida aparecer. E ela aparece: não era “vou pensar”, eram os 30%.',
  4: 'Responde exatamente à dúvida dela, com fato e com um exemplo marcado como exemplo. Não fala de golpe, de prazo ou de outra coisa.',
  5: 'Confere se ficou claro e convida mais perguntas. Se ela respondesse “mais ou menos”, a atendente voltaria ao passo 3.',
  6: 'Um próximo passo pequeno e concreto, com uma pergunta fácil de responder: “posso explicar agora?”.',
};
export function AnatomiaResposta() {
  const [ativo, setAtivo] = useState<number | null>(null);
  return (
    <Figura tag="Exemplo" legenda="Conversa de exemplo (nome fictício). Toque em um passo para destacar a mensagem que o executa. O passo 1, ouvir, não aparece: é ler tudo antes de digitar.">
      <div className="mv-ob-an" data-ativo={ativo !== null ? '' : undefined}>
        <div className="mv-ob-an-leg" role="group" aria-label="Destacar um passo do método">
          {[2, 3, 4, 5, 6].map((n) => (
            <button key={n} type="button" aria-pressed={ativo === n} data-obtom={GRUPO[METODO[n - 1].grupo].tom}
              onClick={() => setAtivo(ativo === n ? null : n)}>
              <span className="num">{n}</span>{METODO[n - 1].t}
            </button>
          ))}
        </div>
        <div className="mv-ob-an-chat">
          {CONVERSA_ANAT.map((c, i) => (
            <div key={i} className="mv-ob-an-b" data-quem={c.quem}
              data-obtom={c.passo ? GRUPO[METODO[c.passo - 1].grupo].tom : undefined}
              data-luz={ativo !== null && c.passo === ativo ? '' : undefined}>
              {c.passo && <span className="mv-ob-an-tag"><span className="num">{c.passo}</span>{METODO[c.passo - 1].t}</span>}
              <p>{c.t}</p>
            </div>
          ))}
        </div>
        <p className="mv-ob-an-exp" aria-live="polite">
          {ativo === null
            ? 'Toque num dos passos acima para ver o que aquela mensagem está fazendo.'
            : <><b>Passo {ativo}, {METODO[ativo - 1].t.toLowerCase()}.</b> {EXPLICA_ANAT[ativo]}</>}
        </p>
      </div>
    </Figura>
  );
}

/* ===================================================================== as cinco famílias */
const IC_FAMILIA: Record<FamiliaId, ReactNode> = {
  confianca: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></>,
  dinheiro: <><circle cx="12" cy="12" r="8.5" /><path d="M14.5 9.3c-.5-.8-1.4-1.3-2.5-1.3-1.5 0-2.6.8-2.6 1.9 0 2.6 5.3 1.4 5.3 4.1 0 1.1-1.1 2-2.7 2-1.2 0-2.2-.5-2.7-1.4M12 6.5V8M12 16v1.5" /></>,
  tempo: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  expectativa: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  pratica: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 17.5h2" /></>,
};
export function FamiliasObjecao() {
  return (
    <Figura legenda="As 18 objeções do manual, agrupadas pelo sentimento de onde nascem. A última linha de cada cartão é o que o cliente precisa sentir para seguir.">
      <div className="mv-ob-fam">
        {FAMILIAS.map((f) => {
          const itens = OBJECOES.filter((o) => o.familia === f.id);
          return (
            <section key={f.id} className="mv-ob-fam-card" data-obtom={f.tom} aria-label={`Família ${f.nome}`}>
              <header>
                <span className="mv-ob-fam-ic" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{IC_FAMILIA[f.id]}</svg>
                </span>
                <span><b>{f.nome}</b><small className="num">{itens.length} objeções</small></span>
              </header>
              <dl>
                <div><dt>O que ele sente</dt><dd>{f.sente}</dd></div>
                <div><dt>O que precisa sentir</dt><dd>{f.precisa}</dd></div>
              </dl>
              <ul className="mv-ob-fam-chips">
                {itens.map((o) => <li key={o.id}>{o.chip}</li>)}
              </ul>
            </section>
          );
        })}
      </div>
    </Figura>
  );
}

/* ===================================================================== caixa de fatos */
const FATOS_USO: { f: string; usa: string }[] = [
  { f: 'Nada é pago para começar.', usa: 'golpe · sem dinheiro · 30%' },
  { f: 'Honorários: 30% do valor que o cliente receber, no final. Percentual fixo.', usa: '30% · e se eu perder · sem dinheiro' },
  { f: 'O advogado, Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos.', usa: 'golpe · outra empresa · só quero empréstimo' },
  { f: 'O resultado depende da análise: ninguém garante valor nem resultado.', usa: 'quanto vou receber · e se eu perder' },
  { f: 'Costuma levar de 6 a 12 meses.', usa: 'demora muito' },
  { f: 'As procurações são assinadas digitalmente pelo gov.br (conta prata ou ouro).', usa: 'golpe · documentos' },
  { f: 'Possibilidade de aumento de margem e de portabilidade, que pode liberar um valor acima de R$\u00a01.500.', usa: 'só quero empréstimo · pré-aprovada · demora' },
  { f: 'A senha nunca é condição: o cliente pode baixar os documentos com a sua ajuda.', usa: 'senha · Meu INSS' },
  { f: 'A foto do rosto confirma que é a própria pessoa fazendo.', usa: 'documentos' },
  { f: 'Sem e-mail? A gente cria um.', usa: 'e-mail' },
  { f: 'Comprovante de alguém da família: documento com foto dessa pessoa + declaração de residência.', usa: 'comprovante' },
  { f: 'Financeiras com que trabalhamos: Agibank, BMG, Facta, Mercantil e Crefisa.', usa: 'qual banco' },
];
const NUNCA_FATO: { f: string; porque: string }[] = [
  { f: '“Você vai receber X.”', porque: 'O resultado depende da análise.' },
  { f: '“É causa ganha.” / “Não tem como perder.”', porque: 'Ninguém garante resultado.' },
  { f: '“Se perder, não paga nada, é garantido.”', porque: 'Não use como garantia. Diga que os 30% saem do valor recebido.' },
  { f: '“Sai em dois meses.”', porque: 'Prazo inventado. Fale em 6 a 12 meses, em média.' },
  { f: '“O empréstimo vai sair.”', porque: 'Nem empréstimo nem portabilidade são garantidos.' },
  { f: '“A análise é só hoje.”', porque: 'Urgência falsa: proibida.' },
];
export function CaixaFatos() {
  return (
    <Figura legenda="Em cima, os fatos-âncora: confirmados, para usar no passo 4, com as objeções em que cada um ajuda. Embaixo, frases que parecem ajudar, mas nunca são fato.">
      <div className="mv-ob-cx">
        <section className="mv-ob-cx-col" data-obtom="verde" aria-label="Fatos que você pode usar">
          <h4><IcCheck />Fatos que você pode usar</h4>
          <ul className="mv-ob-cx-fatos">
            {FATOS_USO.map((x) => (
              <li key={x.f}><span>{x.f}</span><small>Serve para: {x.usa}</small></li>
            ))}
          </ul>
        </section>
        <section className="mv-ob-cx-col" data-obtom="rubro" aria-label="Frases que nunca são fato">
          <h4><IcX />Nunca é fato: não diga</h4>
          <ul className="mv-ob-cx-nao">
            {NUNCA_FATO.map((x) => (
              <li key={x.f}><b>{x.f}</b><small>{x.porque}</small></li>
            ))}
          </ul>
        </section>
      </div>
    </Figura>
  );
}

/* ===================================================================== sinais de seriedade × sinais de golpe */
const SINAIS_BONS = [
  { t: 'Nada é pago antes', d: 'O cliente não paga nada para começar. Os 30% saem do valor que ele receber, no final.' },
  { t: 'Um advogado com nome', d: 'O processo é conduzido pelo Dr. Rafael Menezes.' },
  { t: 'Assinatura no gov.br', d: 'As procurações são assinadas digitalmente no sistema oficial do governo.' },
  { t: 'A família pode participar', d: 'Filho, filha ou alguém de confiança pode ler a conversa junto.' },
  { t: 'Tudo por escrito', d: 'O cliente pode reler e mostrar para quem quiser antes de decidir.' },
];
const SINAIS_GOLPE = [
  'Pede Pix, taxa ou depósito para “liberar” um dinheiro.',
  'Apressa: “é só hoje”, “a vaga vai acabar”.',
  'Promete um valor certo, antes de qualquer análise.',
  'Exige senha ou código como condição para seguir.',
];
export function SinaisSeguranca() {
  return (
    <Figura legenda="Você não convence dizendo “pode confiar”. Convence mostrando sinais concretos, e nunca fazendo o que um golpista faz.">
      <div className="mv-ob-sin">
        <section className="mv-ob-sin-col" data-obtom="verde">
          <header>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" />
            </svg>
            <span><b>Sinais de seriedade</b><small>mostre sem medo: são todos verdade</small></span>
          </header>
          <ol>
            {SINAIS_BONS.map((s, i) => (
              <li key={s.t}><span className="num">{i + 1}</span><div><b>{s.t}</b><p>{s.d}</p></div></li>
            ))}
          </ol>
        </section>
        <section className="mv-ob-sin-col" data-obtom="rubro">
          <header>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3.5L2.8 19.5h18.4L12 3.5z" /><path d="M12 10v4.5M12 17.2v.01" />
            </svg>
            <span><b>O que um golpe costuma fazer</b><small>e você nunca faz</small></span>
          </header>
          <ul>
            {SINAIS_GOLPE.map((s) => <li key={s}><IcX /><span>{s}</span></li>)}
          </ul>
        </section>
      </div>
    </Figura>
  );
}

/* ===================================================================== linha do tempo do pagamento */
export function LinhaDinheiro() {
  return (
    <Figura legenda="Quando o cliente paga: nada no começo, nada durante o processo, e no final os 30% saem do valor que ele receber.">
      <Rolo>
      <svg viewBox="0 0 760 246" role="img" aria-label="Linha do tempo do pagamento: no começo o cliente paga zero; durante o processo, que costuma levar de 6 a 12 meses, paga zero; no final, do valor que o cliente receber, 70% ficam com ele e 30% são os honorários do advogado. Exemplo: recebeu 10 mil reais, 7 mil ficam com o cliente e 3 mil são os honorários.">
        <defs>
          <marker id="mv-ob-ld-seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path className="mv-ob-seta-p" d="M0,0 L10,5 L0,10 z" />
          </marker>
        </defs>
        <line className="mv-ob-ld-eixo" x1="40" y1="70" x2="720" y2="70" markerEnd="url(#mv-ob-ld-seta)" />
        {[120, 360, 595].map((x) => <circle key={x} className="mv-ob-ld-pt" cx={x} cy="70" r="7" />)}
        <text className="mv-ob-ld-et" x="120" y="48" textAnchor="middle">Começo</text>
        <text className="mv-ob-ld-et" x="360" y="48" textAnchor="middle">Durante o processo</text>
        <text className="mv-ob-ld-et" x="595" y="48" textAnchor="middle">No final</text>

        <text className="mv-ob-ld-zero" x="120" y="114" textAnchor="middle">R$ 0</text>
        <text className="mv-ob-ld-tx" x="120" y="138" textAnchor="middle">nada para começar</text>
        <text className="mv-ob-ld-zero" x="360" y="114" textAnchor="middle">R$ 0</text>
        <text className="mv-ob-ld-tx" x="360" y="138" textAnchor="middle">costuma levar de 6 a 12 meses</text>

        {/* barra do valor recebido: 470→720 (250px); 70% = 175px, 30% = 75px */}
        <rect className="mv-ob-ld-cli" x="470" y="90" width="173" height="30" rx="6" />
        <rect className="mv-ob-ld-adv" x="647" y="90" width="73" height="30" rx="6" />
        <text className="mv-ob-ld-pc" x="556.5" y="110" textAnchor="middle">70%</text>
        <text className="mv-ob-ld-pc" x="683.5" y="110" textAnchor="middle">30%</text>
        <text className="mv-ob-ld-tx" x="556.5" y="138" textAnchor="middle">fica com o cliente</text>
        <text className="mv-ob-ld-tx" x="683.5" y="138" textAnchor="middle">advogado</text>
        <text className="mv-ob-ld-tx" x="595" y="160" textAnchor="middle">do valor que o cliente receber</text>

        <rect className="mv-ob-ld-ex" x="40" y="186" width="680" height="50" rx="10" />
        <text className="mv-ob-ld-exr" x="380" y="206" textAnchor="middle">EXEMPLO, SÓ PARA MOSTRAR A CONTA</text>
        <text className="mv-ob-ld-ext" x="380" y="225" textAnchor="middle">Recebeu R$ 10.000 → R$ 7.000 ficam com o cliente · R$ 3.000 são os honorários</text>
      </svg>
      </Rolo>
    </Figura>
  );
}

/* ===================================================================== árvore: até onde ir */
export function ArvoreInsistir() {
  const caixa = (x: number, y: number, w: number, h: number, tom: TomOb, linhas: string[]) => (
    <g data-obtom={tom}>
      <rect className="mv-ob-av-cx" x={x} y={y} width={w} height={h} rx="10" />
      {linhas.map((l, i) => (
        <text key={l} className="mv-ob-av-t" x={x + w / 2} y={y + h / 2 + 4.5 + (i - (linhas.length - 1) / 2) * 18} textAnchor="middle">{l}</text>
      ))}
    </g>
  );
  const rot = (x: number, y: number, t: string, ancora: 'start' | 'middle' = 'middle') => (
    <text className="mv-ob-av-r" x={x} y={y} textAnchor={ancora}>{t}</text>
  );
  return (
    <Figura legenda="Vale para qualquer objeção. O lado verde avança; o lado azul respeita o tempo do cliente; o lado vermelho encerra com carinho, sem insistir.">
      <Rolo>
      <svg viewBox="0 0 760 380" role="img" aria-label="Árvore de decisão. O cliente fez uma objeção. Você já sabe o motivo real? Se não, pergunte o porquê e volte. Se sim, responda com fato: ele entendeu e concordou? Se sim, combine o próximo passo. Se não, explique de outro jeito, uma vez. Se entendeu, combine o próximo passo. Se ainda não: como ele ficou? Se disse não, agradeça com carinho e não insista. Se vai pensar, deixe a porta aberta e combine o retorno.">
        <defs>
          <marker id="mv-ob-av-seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path className="mv-ob-seta-p" d="M0,0 L10,5 L0,10 z" />
          </marker>
        </defs>
        {/* setas */}
        <g className="mv-ob-av-setas">
          <line x1="380" y1="48" x2="380" y2="78" markerEnd="url(#mv-ob-av-seta)" />
          <line x1="510" y1="102" x2="558" y2="102" markerEnd="url(#mv-ob-av-seta)" />
          <line x1="380" y1="124" x2="380" y2="158" markerEnd="url(#mv-ob-av-seta)" />
          <line x1="510" y1="186" x2="558" y2="186" markerEnd="url(#mv-ob-av-seta)" />
          <line x1="380" y1="212" x2="380" y2="246" markerEnd="url(#mv-ob-av-seta)" />
          <path d="M510,268 H652 V214" markerEnd="url(#mv-ob-av-seta)" />
          <line x1="380" y1="288" x2="380" y2="320" markerEnd="url(#mv-ob-av-seta)" />
          <line x1="490" y1="344" x2="558" y2="344" markerEnd="url(#mv-ob-av-seta)" />
          <line x1="270" y1="344" x2="188" y2="344" markerEnd="url(#mv-ob-av-seta)" />
        </g>
        {caixa(250, 10, 260, 38, 'neutro', ['O cliente fez uma objeção'])}
        {caixa(250, 80, 260, 44, 'ambar', ['Você já sabe o motivo real?'])}
        {caixa(560, 74, 184, 56, 'neutro', ['Pergunte o porquê', '(passo 3) e volte'])}
        {caixa(250, 160, 260, 52, 'ambar', ['Respondeu com fato.', 'Ele entendeu e concordou?'])}
        {caixa(560, 160, 184, 52, 'verde', ['Combine o', 'próximo passo'])}
        {caixa(250, 248, 260, 40, 'neutro', ['Explique de outro jeito, uma vez'])}
        {caixa(270, 322, 220, 44, 'ambar', ['Como ele ficou?'])}
        {caixa(560, 316, 184, 56, 'rubro', ['Agradeça com carinho', 'e não insista'])}
        {caixa(16, 316, 170, 56, 'azul', ['Deixe a porta aberta', 'e combine o retorno'])}
        {rot(534, 95, 'não')}
        {rot(390, 146, 'sim', 'start')}
        {rot(534, 179, 'sim')}
        {rot(390, 234, 'não', 'start')}
        {rot(581, 261, 'entendeu')}
        {rot(390, 310, 'ainda não', 'start')}
        {rot(524, 336, 'disse não')}
        {rot(229, 336, 'vai pensar')}
      </svg>
      </Rolo>
    </Figura>
  );
}

/* ===================================================================== conversas encenadas */
type Nota = { grupo: Grupo | 'extra'; passo: string; t: string };
function CenaAnotada({ contato, sub, legenda, bolhas, notas }: { contato: string; sub: string; legenda: string; bolhas: Bolha[]; notas: Nota[] }) {
  return (
    <div className="mv-ob-cena">
      <Celular contato={contato} sub={sub} legenda={legenda} bolhas={bolhas} />
      <div className="vidro mv-ob-cena-notas">
        <span className="mv-ob-cena-tit">O que cada mensagem está fazendo</span>
        <ol>
          {notas.map((n) => (
            <li key={n.passo + n.t} data-obtom={n.grupo === 'extra' ? 'neutro' : GRUPO[n.grupo].tom}>
              <span className="mv-ob-cena-passo">{n.passo}</span>
              <p>{n.t}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function CenaGolpe() {
  return (
    <CenaAnotada
      contato="Seu Joaquim" sub="cliente · canal de juros abusivos"
      legenda="Conversa de exemplo (nome fictício). Sugestão de roteiro: adapte ao cliente."
      bolhas={[
        { de: 'cliente', texto: 'Isso aí não é golpe não? Vejo tanta coisa na televisão...', hora: '09:41' },
        { de: 'eu', texto: 'Entendo a sua preocupação, Seu Joaquim. É muito bom o senhor desconfiar, hoje todo cuidado é pouco.', hora: '09:42' },
        { de: 'eu', texto: 'Posso perguntar: aconteceu alguma coisa que deixou o senhor com o pé atrás?', hora: '09:42' },
        { de: 'cliente', texto: 'Meu vizinho caiu num golpe. Pediram um Pix pra liberar um dinheiro e sumiram.', hora: '09:44' },
        { de: 'eu', texto: 'Que situação triste. Então o senhor vai gostar de saber como é aqui: o senhor não paga nada para começar. Nem Pix, nem taxa, nada.', hora: '09:45' },
        { de: 'eu', texto: 'O nosso advogado, o Dr. Rafael Menezes, entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos. Os honorários dele são 30% do valor que o senhor receber, só no final. O resultado depende da análise.', hora: '09:45' },
        { de: 'eu', texto: 'E as procurações são assinadas no gov.br, o sistema oficial do governo. Ficou claro? Se quiser, pode chamar alguém da família para ler a conversa junto.', hora: '09:46' },
        { de: 'cliente', texto: 'Ficou. Minha filha chega às 6, vou mostrar pra ela.', hora: '09:48' },
        { de: 'eu', texto: 'Combinado! Posso chamar o senhor hoje, às 18h30, para a gente seguir com ela junto?', hora: '09:48' },
      ]}
      notas={[
        { grupo: 'conexao', passo: '1 · Ouvir', t: 'A atendente leu a mensagem inteira e não rebateu. Nada de “golpe nenhum!”.' },
        { grupo: 'conexao', passo: '2 · Acolher', t: '“É muito bom o senhor desconfiar”: valida o medo em vez de discutir com ele.' },
        { grupo: 'diagnostico', passo: '3 · Entender', t: 'A pergunta revela o motivo real: o vizinho que pagou um Pix e perdeu o dinheiro.' },
        { grupo: 'resposta', passo: '4 · Fato', t: 'Responde exatamente ao medo do Pix: nada é pago para começar. Depois, dois sinais de seriedade: o advogado com nome e o gov.br.' },
        { grupo: 'resposta', passo: '5 · Confirmar', t: '“Ficou claro?”, mais o convite para a família, que reforça a segurança.' },
        { grupo: 'avanco', passo: '6 · Próximo passo', t: 'Horário combinado, já com a filha junto. A conversa não termina no ar.' },
      ]}
    />
  );
}

export function CenaSenha() {
  return (
    <CenaAnotada
      contato="Dona Teresa" sub="cliente · juntando os documentos"
      legenda="Conversa de exemplo (nome fictício). Sugestão de roteiro: adapte ao cliente."
      bolhas={[
        { de: 'cliente', texto: 'Senha eu não passo pra ninguém. Minha neta falou pra nunca passar.', hora: '15:10' },
        { de: 'eu', texto: 'Sua neta está certíssima, Dona Teresa. E a senhora não precisa passar a senha.', hora: '15:11' },
        { de: 'eu', texto: 'Eu explico passo a passo e a senhora mesma baixa os documentos no seu celular, no seu tempo. Vamos tentar agora?', hora: '15:11' },
        { de: 'cliente', texto: 'Vamos. Mas eu me atrapalho com essas coisas.', hora: '15:13' },
        { de: 'eu', texto: 'A gente vai devagar, um passo de cada vez. Primeiro: abra o aplicativo Meu INSS e entre com a sua senha do gov.br. Quando aparecer a tela inicial, me avisa.', hora: '15:13' },
        { de: 'cliente', texto: 'Entrei.', hora: '15:16' },
        { de: 'eu', texto: 'Muito bem! Agora toque na busca, onde está escrito “Do que você precisa?”, e digite: Extrato de Empréstimo Consignado.', hora: '15:16' },
        { de: 'cliente', tipo: 'documento', legenda: 'extrato-emprestimo-consignado.pdf', hora: '15:21' },
        { de: 'eu', texto: 'Recebi! A senhora foi ótima. Agora vamos para o próximo documento.', hora: '15:22' },
      ]}
      notas={[
        { grupo: 'conexao', passo: '2 · Acolher', t: 'Dá razão à neta. A cliente se sente respeitada, não contrariada.' },
        { grupo: 'resposta', passo: '4 · Fato', t: '“A senhora não precisa passar a senha”: é verdade, e tira o medo na hora.' },
        { grupo: 'avanco', passo: '6 · Próximo passo', t: 'Já propõe fazer agora, juntas, no tempo dela.' },
        { grupo: 'extra', passo: 'Ajuda prática', t: 'Um passo por mensagem, com o nome exato do documento que aparece no aplicativo.' },
        { grupo: 'resposta', passo: '5 · Confirmar', t: '“Quando aparecer a tela inicial, me avisa”: confere cada etapa antes da próxima.' },
        { grupo: 'extra', passo: 'Reconhecer', t: 'Elogiar o progresso deixa a cliente segura para continuar com os outros documentos.' },
      ]}
    />
  );
}

/* A cena acontece DEPOIS do primeiro passo do canal de empréstimo (apresentar-se,
   explicar a "pré-aprovada", perguntar o que a pessoa precisa e pedir os extratos):
   a atendente conferiu os extratos e a margem está comprometida. */
export function CenaPreAprovada() {
  const inicio: Bolha[] = [
    { de: 'eu', texto: 'Dona Lúcia, conferi os seus extratos. Hoje a sua margem está comprometida com os empréstimos que a senhora já tem, por isso um empréstimo novo não sai agora.', hora: '15:02' },
    { de: 'cliente', texto: 'Mas a mensagem disse que estava pré-aprovada! Por que falaram isso, então?', hora: '15:04' },
  ];
  return (
    <BomRuim
      ruim={{
        titulo: 'Culpa o robô e promete',
        corpo: (
          <Celular contato="Dona Lúcia" sub="cliente · canal de empréstimo" legenda="Nome fictício. Joga a empresa contra ela mesma e promete o que não existe: ela está sem margem."
            bolhas={[
              ...inicio,
              { de: 'eu', texto: 'Ah, isso foi o robô que se confundiu. Mas fica tranquila: manda os documentos que eu dou um jeito de sair.', hora: '15:05' },
              { de: 'cliente', texto: 'Ah, bom! Então já vou contar com esse dinheiro.', hora: '15:06' },
            ]} />
        ),
      }}
      bom={{
        titulo: 'Acolhe, explica e mostra caminhos',
        corpo: (
          <Celular contato="Dona Lúcia" sub="cliente · canal de empréstimo" legenda="Exemplo com nome fictício. Sugestão de roteiro: adapte ao cliente."
            bolhas={[
              ...inicio,
              { de: 'eu', texto: 'Entendo a sua chateação, Dona Lúcia, e peço desculpa se a mensagem deu outra impressão.', hora: '15:05' },
              { de: 'eu', texto: '“Pré-aprovada” quer dizer que a sua análise inicial passou nas primeiras perguntas, e por isso pôde seguir até aqui. Não é um valor liberado.', hora: '15:05' },
              { de: 'eu', texto: 'Mas existem caminhos: a possibilidade de aumento de margem, a de portabilidade, que pode liberar um valor acima de R$\u00a01.500, e uma ação com o nosso advogado pedindo o ressarcimento do que foi descontado nos últimos 10 anos. O resultado depende da análise. Posso explicar cada um?', hora: '15:06' },
              { de: 'cliente', texto: 'Pode sim.', hora: '15:08' },
            ]} />
        ),
      }}
    />
  );
}

export function CenaFilho() {
  const inicio: Bolha = { de: 'cliente', texto: 'Gostei. Mas vou falar com meu filho primeiro.', hora: '16:02' };
  return (
    <BomRuim
      ruim={{
        titulo: 'Pressão e urgência falsa',
        corpo: (
          <Celular contato="Seu Valdir" sub="cliente" legenda="Desrespeita a família e inventa um prazo."
            bolhas={[
              inicio,
              { de: 'eu', texto: 'Não precisa, Seu Valdir, a decisão é sua! E a análise é só hoje, viu?', hora: '16:03' },
              { de: 'cliente', texto: 'Então deixa pra lá.', hora: '16:09' },
            ]} />
        ),
      }}
      bom={{
        titulo: 'Facilita e combina o retorno',
        corpo: (
          <Celular contato="Seu Valdir" sub="cliente" legenda="Exemplo com nome fictício. Sugestão de roteiro."
            bolhas={[
              inicio,
              { de: 'eu', texto: 'Ótima ideia, Seu Valdir. Decisão assim é bom tomar em família.', hora: '16:03' },
              { de: 'eu', texto: 'Posso mandar aqui um resumo por escrito, para o senhor mostrar a ele? E, se ele quiser, pode falar comigo direto.', hora: '16:03' },
              { de: 'cliente', texto: 'Manda sim. Ele chega à noite.', hora: '16:05' },
              { de: 'eu', texto: 'Combinado! Já mando o resumo. Amanhã de manhã eu chamo o senhor para saber o que vocês decidiram, pode ser?', hora: '16:06' },
              { de: 'cliente', texto: 'Pode.', hora: '16:06' },
            ]} />
        ),
      }}
    />
  );
}

/* ===================================================================== treino: escolha a melhor resposta */
type Rodada = { ctx: string; cliente: string; certa: number; ops: { t: string; fb: string }[] };
/* As três opções de cada rodada têm tamanho parecido: a certa não é a mais longa,
   para o treino não ser resolvido "pela maior resposta". */
const RODADAS: Rodada[] = [
  {
    ctx: 'Canal de juros. Seu Joaquim, logo depois de você se apresentar.',
    cliente: 'Isso aí é golpe, né? Ninguém dá dinheiro de graça.',
    certa: 1,
    ops: [
      { t: 'Golpe nenhum, Seu Joaquim! Pode confiar, a gente é uma empresa séria.', fb: 'Pedir confiança não gera confiança. Faltou acolher, entender o motivo e mostrar um fato.' },
      { t: 'Entendo, é muito bom desconfiar. O que deixou o senhor com o pé atrás?', fb: 'Acolhe (passo 2) e pergunta o motivo real (passo 3). Depois de ouvir, você mostra os fatos certos para o medo dele.' },
      { t: 'Não é golpe: o senhor não paga nada, e o advogado é o Dr. Rafael Menezes.', fb: 'Os fatos estão certos, mas chegaram cedo demais. Sem acolher e sem saber o motivo real, você pode responder ao medo errado.' },
    ],
  },
  {
    ctx: 'Dona Cida já entendeu como o processo funciona e pergunta:',
    cliente: 'E se eu perder esse processo?',
    certa: 2,
    ops: [
      { t: 'Fica tranquila, Dona Cida: com o nosso advogado, é causa ganha, não tem como perder.', fb: 'Promessa de resultado. Ninguém pode garantir o resultado de um processo.' },
      { t: 'Se perder, a senhora não paga nada, e isso é garantido pela empresa, pode confiar.', fb: 'Soa como garantia. O que você pode afirmar é que os 30% saem do valor que a cliente receber.' },
      { t: 'Ninguém garante o resultado. E nada é pago antes: os 30% saem do valor recebido.', fb: 'Honesta sobre o risco e clara sobre o pagamento, só com fatos. Depois, confirme se ficou claro.' },
    ],
  },
  {
    ctx: 'Canal de empréstimo. Você já se apresentou e explicou a “pré-aprovada”. Conferiu os extratos de Dona Lúcia: ela está sem margem.',
    cliente: 'Mas disseram que estava pré-aprovado! Cadê o meu dinheiro?',
    certa: 0,
    ops: [
      { t: 'Peço desculpa pela confusão: pré-aprovada não é valor liberado. Posso mostrar os caminhos?', fb: 'Acolhe, repete com honestidade o que a palavra quer dizer e abre espaço para os caminhos: aumento de margem, portabilidade e a ação.' },
      { t: 'Ah, isso foi o robô que se confundiu, Dona Lúcia. Pode desconsiderar aquela mensagem, tá bom?', fb: 'Culpar o robô joga a empresa contra ela mesma e não resolve a frustração.' },
      { t: 'Calma, Dona Lúcia! Manda os documentos que eu dou um jeito de o seu empréstimo sair, viu?', fb: 'Promessa falsa: ela está sem margem. Quando descobrir, a confiança acaba.' },
    ],
  },
  {
    ctx: 'Seu Valdir gostou da explicação, mas diz:',
    cliente: 'Vou falar com meu filho e depois te falo.',
    certa: 1,
    ops: [
      { t: 'Não precisa falar com ninguém, Seu Valdir, a decisão é sua. Vamos fazer agora?', fb: 'Desrespeita a família e soa como pressão. Decidir em família é direito dele.' },
      { t: 'Ótima ideia! Mando um resumo para ele, e amanhã de manhã chamo o senhor?', fb: 'Facilita a decisão com o resumo, inclui o filho e combina o próximo passo.' },
      { t: 'Tá bom, Seu Valdir. Fica à vontade e, qualquer coisa, o senhor me chama aqui.', fb: 'Educado, mas a conversa termina sem combinado, e esfria.' },
    ],
  },
  {
    ctx: 'Dona Teresa topou a análise. Você pediu o primeiro extrato do Meu INSS.',
    cliente: 'Não sei mexer nesse Meu INSS. Não entendo nada de celular.',
    certa: 2,
    ops: [
      { t: 'É fácil, qualquer um consegue! Baixa o aplicativo e me manda os extratos.', fb: 'Para quem não sabe, “é fácil” soa como “você é que não sabe”. E mandar fazer sozinha não ajuda.' },
      { t: 'Então me passa a senha do gov.br que eu resolvo tudo por aqui para a senhora.', fb: 'A senha é uma escolha do cliente, nunca o seu ponto de partida. Primeiro ofereça ajuda para ela mesma baixar.' },
      { t: 'Sem problema, a gente faz junto, um passo de cada vez. Vamos tentar agora?', fb: 'Acolhe sem diminuir e propõe fazer junto, no tempo dela. Se ela travar, peça um print da tela.' },
    ],
  },
];
export function TreinoRespostas() {
  const [rodada, setRodada] = useState(0);
  const [escolha, setEscolha] = useState<number | null>(null);
  const [acertos, setAcertos] = useState(0);
  const fim = rodada >= RODADAS.length;

  function escolher(i: number) {
    if (escolha !== null) return;
    setEscolha(i);
    if (i === RODADAS[rodada].certa) setAcertos((a) => a + 1);
  }
  function seguir() { setRodada((r) => r + 1); setEscolha(null); }
  function recomecar() { setRodada(0); setEscolha(null); setAcertos(0); }

  if (fim) {
    const tudo = acertos === RODADAS.length;
    return (
      <div className="vidro mv-ob-tr" data-fim="">
        <span className="mv-ob-tr-tag">Treino concluído</span>
        <b className="mv-ob-tr-placar num">{acertos} de {RODADAS.length}</b>
        <p>{tudo
          ? 'Perfeito. Você acolheu, perguntou, respondeu só com fatos e combinou o próximo passo.'
          : 'Releia as explicações das rodadas que errou. O padrão das respostas certas é sempre o mesmo: acolher, entender, responder com fato e combinar o próximo passo.'}</p>
        <button type="button" className="mv-link" onClick={recomecar}>Treinar de novo</button>
      </div>
    );
  }

  const r = RODADAS[rodada];
  return (
    <div className="vidro mv-ob-tr">
      <div className="mv-ob-tr-topo">
        <span className="mv-ob-tr-tag">Treino · rodada <span className="num">{rodada + 1} de {RODADAS.length}</span></span>
        <div className="mv-ob-tr-prog" aria-hidden><i style={{ width: `${(rodada / RODADAS.length) * 100}%` }} /></div>
      </div>
      <p className="mv-ob-tr-ctx">{r.ctx}</p>
      <div className="mv-ob-tr-cli"><span>Cliente</span><p>{r.cliente}</p></div>
      <p className="mv-ob-tr-perg">Qual resposta você mandaria?</p>
      <div className="mv-ob-tr-ops" role="group" aria-label="Opções de resposta">
        {r.ops.map((o, i) => {
          const estado = escolha === null ? undefined : i === r.certa ? 'certa' : i === escolha ? 'errada' : 'outra';
          return (
            <div key={o.t} className="mv-ob-tr-op" data-estado={estado}>
              <button type="button" disabled={escolha !== null} onClick={() => escolher(i)}>
                <span className="mv-ob-tr-l">{String.fromCharCode(65 + i)}</span>
                <span>{o.t}</span>
              </button>
              {escolha !== null && (
                <p className="mv-ob-tr-fb">
                  {i === r.certa ? <IcCheck /> : <IcX />}
                  <span>{o.fb}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
      {escolha !== null && (
        <div className="mv-ob-tr-pe" role="status">
          <b>{escolha === r.certa ? 'Boa escolha.' : 'Essa não é a melhor.'}</b>
          <button type="button" className="mv-link" onClick={seguir}>
            {rodada === RODADAS.length - 1 ? 'Ver resultado' : 'Próxima rodada'}
          </button>
        </div>
      )}
    </div>
  );
}
