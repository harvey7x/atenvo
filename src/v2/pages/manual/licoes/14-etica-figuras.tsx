/* Lição 14 — ilustrações próprias (prefixo mv-et-): o escudo da confiança, as
   quatro regras da senha, o jogo "é dado pessoal?", o caminho do dado, o print que
   mostra demais, sinais de golpe × jeito CAF, o detector de golpe, os quatro
   "nunca", a régua da persuasão, o semáforo das situações delicadas, o treino
   "pode ou não pode?", o cartaz do combinado e a troca de frases do nome certo
   (empréstimo pessoal × consignado; cores iguais às da lição 3: consignado azul,
   pessoal âmbar, processo verde). Só tokens do v2 (claro e escuro).
   Fatos da empresa: só os do brief. Casos e nomes de clientes são fictícios. */
import { useState, type ReactNode } from 'react';
import { Figura, IcCheck, IcX } from '../pecas';

/* ===================================================================== ícones */
const PATHS = {
  chave: <><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M21 12v2" /></>,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  moeda: <><circle cx="12" cy="12" r="8.5" /><path d="M14.6 9.3c-.6-.8-1.5-1.2-2.6-1.2-1.5 0-2.6.8-2.6 1.9s1.1 1.6 2.6 1.9 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2.1-.5-2.7-1.3M12 6.6v1.5M12 15.9v1.5" /></>,
  coracao: <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0112 7.3a4.2 4.2 0 017.5 2.5C19.5 15.4 12 20 12 20z" />,
  cadeado: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 018 0v2.5M12 14.5v2.5" /></>,
  olho: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  alerta: <><path d="M12 3.5L2.8 19.5h18.4L12 3.5z" /><path d="M12 10v4.5M12 17.2v.01" /></>,
  escudo: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6L12 3z" /><path d="M8.8 12.2l2.2 2.2 4.2-4.4" /></>,
  relogio: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  pessoa: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" /></>,
  caneta: <><path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5 4 20z" /><path d="M13.5 7l3 3" /></>,
  troca: <path d="M4 9h13l-3-3M20 15H7l3 3" />,
  celular: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.2" /><path d="M9.5 9h.01M12 9h.01M14.5 9h.01M10 18h4" /></>,
  balao: <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />,
  lapis: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13 7l4 4" /></>,
} satisfies Record<string, ReactNode>;
type IconeId = keyof typeof PATHS;

function Icone({ id }: { id: IconeId }) {
  return (
    <svg className="mv-et-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>{PATHS[id]}</svg>
  );
}
/** Envolve os ícones das peças (IcCheck/IcX) para não herdarem o width:100% das figuras. */
const Mini = ({ children }: { children: ReactNode }) => <span className="mv-et-icw" aria-hidden>{children}</span>;

/* ===================================================================== 1. escudo da confiança */
type PilarId = 'senha' | 'dados' | 'dinheiro' | 'respeito';
const PILARES: { id: PilarId; t: string; sub: string; ic: IconeId; protege: string; regra: string; onde: string }[] = [
  {
    id: 'senha', t: 'Senha', sub: 'a chave do gov.br do cliente', ic: 'chave',
    protege: 'A conta gov.br do cliente, que abre o Meu INSS, o Meu Imposto de Renda e a assinatura digital.',
    regra: 'Usar só para pegar os documentos, nunca anotar e ajudar o cliente a trocar a senha depois.',
    onde: 'Seção 2 desta lição.',
  },
  {
    id: 'dados', t: 'Dados', sub: 'CPF, documentos e extratos', ic: 'doc',
    protege: 'Tudo o que identifica o cliente e conta a vida financeira dele: CPF, identidade, endereço, extratos, imposto de renda.',
    regra: 'Pedir e acessar só o necessário, e nunca compartilhar fora do trabalho.',
    onde: 'Seções 3 e 4 desta lição.',
  },
  {
    id: 'dinheiro', t: 'Dinheiro', sub: 'nada é pago antes', ic: 'moeda',
    protege: 'O bolso do cliente. Ele não paga nada para começar; os 30% de honorários saem só no final, do valor que ele receber.',
    regra: 'Nunca pedir pagamento, taxa, PIX ou código. Quem pede isso, em qualquer nome, é golpe.',
    onde: 'Seções 5 e 6 desta lição.',
  },
  {
    id: 'respeito', t: 'Respeito', sub: 'clareza e direito ao não', ic: 'coracao',
    protege: 'A liberdade de decidir do cliente, muitas vezes uma pessoa idosa e desconfiada (com razão).',
    regra: 'Explicar os 30% com clareza, não prometer, não pressionar e aceitar o não com carinho.',
    onde: 'Seções 7 e 8 desta lição.',
  },
];
const ESCUDO = 'M100 8C124 20 150 26 176 26V112C176 168 144 206 100 232C56 206 24 168 24 112V26C50 26 76 20 100 8Z';
const QUAD: Record<PilarId, { x: number; y: number; cx: number; cy: number }> = {
  senha: { x: 24, y: 0, cx: 63, cy: 72 },
  dados: { x: 100, y: 0, cx: 137, cy: 72 },
  dinheiro: { x: 24, y: 120, cx: 66, cy: 160 },
  respeito: { x: 100, y: 120, cx: 134, cy: 160 },
};

export function EscudoConfianca() {
  const [ativo, setAtivo] = useState<PilarId>('senha');
  const p = PILARES.find((x) => x.id === ativo) ?? PILARES[0];
  return (
    <Figura tag="Interativo" legenda="O escudo da confiança. Toque em cada parte para ver o que ela protege e a regra de ouro.">
      <div className="mv-et-esc">
        <div className="mv-et-esc-grade">
          {PILARES.map((x) => (
            <button key={x.id} type="button" className="mv-et-esc-card" data-pos={x.id}
              aria-pressed={ativo === x.id} onClick={() => setAtivo(x.id)}>
              <span className="mv-et-esc-cic"><Icone id={x.ic} /></span>
              <span className="mv-et-esc-ctx"><b>{x.t}</b><small>{x.sub}</small></span>
            </button>
          ))}
          <div className="mv-et-esc-meio">
            <svg className="mv-et-esc-svg" viewBox="0 0 200 240" role="img"
              aria-label="Escudo dividido em quatro partes (senha, dados, dinheiro e respeito) com o cliente no centro.">
              <defs><clipPath id="mv-et-esc-clip"><path d={ESCUDO} /></clipPath></defs>
              <g clipPath="url(#mv-et-esc-clip)">
                {PILARES.map((x) => {
                  const q = QUAD[x.id];
                  return (
                    <g key={x.id} className="mv-et-esc-q" data-ativo={ativo === x.id ? '' : undefined} onClick={() => setAtivo(x.id)}>
                      <rect x={q.x} y={q.y} width="76" height="120" />
                      <g className="mv-et-esc-qi" transform={`translate(${q.cx - 15} ${q.cy - 15}) scale(1.25)`}>{PATHS[x.ic]}</g>
                    </g>
                  );
                })}
                <path className="mv-et-esc-corte" d="M100 0V240M0 120H200" />
              </g>
              <path className="mv-et-esc-borda" d={ESCUDO} />
              <circle className="mv-et-esc-centro" cx="100" cy="120" r="26" />
              <text className="mv-et-esc-ct" x="100" y="124" textAnchor="middle">Cliente</text>
            </svg>
          </div>
        </div>
        <div className="mv-et-esc-painel" aria-live="polite">
          <div className="mv-et-esc-ptit"><Icone id={p.ic} /><b>{p.t}</b></div>
          <div className="mv-et-esc-pgr">
            <div><small>O que protege</small><span>{p.protege}</span></div>
            <div><small>Regra de ouro</small><span>{p.regra}</span></div>
            <div><small>Onde estudar</small><span>{p.onde}</span></div>
          </div>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== 2. as quatro regras da senha */
const REGRAS_SENHA: { t: string; o: string; pq: string; ic: IconeId; tom: 'azul' | 'rubro' | 'verde' }[] = [
  {
    t: 'Só para pegar os documentos', ic: 'doc', tom: 'azul',
    o: 'Carta de concessão, extratos, imposto de renda: o que o processo precisa, e nada além.',
    pq: 'Foi para isso que o cliente confiou. Qualquer outro uso, mesmo com boa intenção, é usar a chave sem permissão.',
  },
  {
    t: 'Nunca anotar a senha', ic: 'lapis', tom: 'rubro',
    o: 'Nada de papel, post-it, caderno, planilha, bloco de notas, mensagem fixada ou grupo. E não deixe o navegador salvar a senha.',
    pq: 'Papel se perde, planilha circula, grupo tem muita gente. Senha anotada vira senha de qualquer um.',
  },
  {
    t: 'Nunca usar para outra coisa', ic: 'olho', tom: 'rubro',
    o: 'Não mudar dados da conta, não fazer pedidos, não abrir outros serviços, não “dar uma olhadinha”.',
    pq: 'Se o cliente descobrir que você mexeu em algo que ele não pediu, a confiança acaba, e com razão.',
  },
  {
    t: 'Orientar a troca depois', ic: 'troca', tom: 'verde',
    o: 'Terminou? Saia da conta e ajude o cliente a criar uma senha nova, que só ele saiba.',
    pq: 'Com a senha trocada, a porta volta a ser só dele. É a prova de que você estava ali só para ajudar.',
  },
];
export function RegrasDaSenha() {
  return (
    <Figura tag="Infográfico" legenda="As quatro regras da senha do cliente. Valem sempre, com qualquer cliente, sem exceção.">
      <ol className="mv-et-rs">
        {REGRAS_SENHA.map((r, i) => (
          <li key={r.t} className="mv-et-rs-it" data-tom={r.tom}>
            <div className="mv-et-rs-cab">
              <span className="mv-et-rs-ic"><Icone id={r.ic} /></span>
              <span className="mv-et-rs-n num">Regra {i + 1}</span>
            </div>
            <b className="mv-et-rs-t">{r.t}</b>
            <span className="mv-et-rs-o">{r.o}</span>
            <span className="mv-et-rs-pq"><em>Por quê:</em> {r.pq}</span>
          </li>
        ))}
      </ol>
    </Figura>
  );
}

/* ===================================================================== 3. é dado pessoal? */
const ITENS_DADO: { t: string; pessoal: boolean; extra?: string }[] = [
  { t: 'Nome completo', pessoal: true },
  { t: 'CPF', pessoal: true },
  { t: 'Os 30% de honorários', pessoal: false },
  { t: 'Data de nascimento', pessoal: true },
  { t: 'Endereço', pessoal: true },
  { t: 'Foto do rosto', pessoal: true, extra: 'cuidado extra' },
  { t: 'Telefone do WhatsApp', pessoal: true },
  { t: 'A lista das 5 financeiras', pessoal: false },
  { t: 'E-mail', pessoal: true },
  { t: 'Número do benefício', pessoal: true },
  { t: 'Extratos do INSS', pessoal: true },
  { t: 'O prazo de 6 a 12 meses', pessoal: false },
  { t: 'RG ou CNH', pessoal: true },
  { t: 'Imposto de renda', pessoal: true },
  { t: 'Valor do benefício', pessoal: true },
  { t: 'Parcelas dos empréstimos', pessoal: true },
];
export function QuaisSaoDados() {
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set());
  const [conferido, setConferido] = useState(false);
  const acertos = ITENS_DADO.filter((it, i) => it.pessoal === marcados.has(i)).length;
  function alternar(i: number) {
    if (conferido) return;
    setMarcados((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }
  return (
    <Figura tag="Interativo" legenda="Toque em tudo o que você acha que é dado pessoal e depois confira.">
      <div className="mv-et-qd">
        <div className="mv-et-qd-grade">
          {ITENS_DADO.map((it, i) => {
            const m = marcados.has(i);
            const res = !conferido ? undefined : it.pessoal === m ? 'certo' : it.pessoal ? 'faltou' : 'sobrou';
            const nota = !conferido ? null
              : res === 'certo' ? (it.pessoal ? 'dado pessoal' : 'não é: fala da CAF')
                : res === 'faltou' ? 'também é dado pessoal' : 'não é: fala da CAF';
            return (
              <button key={it.t} type="button" className="mv-et-qd-it" aria-pressed={m} data-res={res}
                disabled={conferido} onClick={() => alternar(i)}>
                <span className="mv-et-qd-box" aria-hidden>{m && <Mini><IcCheck /></Mini>}</span>
                <span className="mv-et-qd-tx">
                  <b>{it.t}</b>
                  {nota && <small>{nota}{conferido && it.extra ? ` · ${it.extra}` : ''}</small>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mv-et-qd-pe">
          {!conferido ? (
            <>
              <span className="num">{marcados.size} marcados</span>
              <button type="button" className="mv-et-bt" data-tom="azul" onClick={() => setConferido(true)}>Conferir</button>
            </>
          ) : (
            <>
              <span role="status"><b className="num">{acertos} de {ITENS_DADO.length}</b> certos. Tudo o que identifica o
                cliente, ou ajuda a identificar, é dado pessoal. Só os três itens sobre a CAF não são.</span>
              <button type="button" className="mv-et-bt" onClick={() => { setMarcados(new Set()); setConferido(false); }}>Recomeçar</button>
            </>
          )}
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== 4. o caminho do dado */
const ETAPAS: { rot: string[]; t: string; acontece: string; risco: string; cuidado: string }[] = [
  {
    rot: ['Chega'], t: 'O dado chega',
    acontece: 'O cliente manda pelo WhatsApp os documentos, fotos e PDFs que você pediu.',
    risco: 'Pedir mais do que o processo precisa, ou receber documento de outra pessoa sem entender por quê.',
    cuidado: 'Peça só o que está na lista e diga para que serve. Confirme o recebimento: “Recebi, obrigado(a)!”.',
  },
  {
    rot: ['Confere'], t: 'Você confere',
    acontece: 'Você abre cada arquivo para ver se está legível, completo e é do período certo.',
    risco: 'Tela à vista de outras pessoas, ou arquivo aberto num aparelho que outras pessoas também usam.',
    cuidado: 'Confira num lugar reservado e bloqueie a tela sempre que levantar.',
  },
  {
    rot: ['Cadastra'], t: 'O cliente é cadastrado',
    acontece: 'Com tudo certo, o cliente é cadastrado no sistema admin, que fornece as procurações.',
    risco: 'Copiar dados por conta própria para cadernos, planilhas pessoais ou anotações “só para adiantar”.',
    cuidado: 'Os dados ficam onde a empresa define, como o sistema da empresa. Nada de cópias paralelas por conta própria.',
  },
  {
    rot: ['Processo'], t: 'O dado serve ao processo',
    acontece: 'A documentação é a base do processo que o nosso advogado, o Dr. Rafael Menezes, leva adiante.',
    risco: 'Mandar documento para quem não trabalha no caso, ou para a conversa errada.',
    cuidado: 'Compartilhe só dentro do trabalho, com quem precisa, e confira o destinatário antes de enviar.',
  },
  {
    rot: ['Sem', 'cópias'], t: 'Nada de cópias soltas',
    acontece: 'Terminada a sua parte, os dados não podem ficar espalhados com você.',
    risco: 'Arquivos esquecidos na pasta de downloads, prints na galeria do celular, papéis na mesa.',
    cuidado: 'Não guarde cópias por conta própria. Onde cada arquivo deve ficar, quem define é a empresa: pergunte ao gestor.',
  },
];
const CC = 180, RA = 128, RN = 38;
const ANG = [-90, -18, 54, 126, 198];
const noPos = (a: number) => ({ x: CC + RA * Math.cos((a * Math.PI) / 180), y: CC + RA * Math.sin((a * Math.PI) / 180) });
/** Setinha no meio do arco, apontando no sentido horário. */
function seta(a: number): string {
  const t = (a * Math.PI) / 180;
  const p = noPos(a);
  const d = { x: -Math.sin(t), y: Math.cos(t) };
  const n = { x: Math.cos(t), y: Math.sin(t) };
  const f = (k: number) => k.toFixed(1);
  return `M${f(p.x - 5 * d.x + 6 * n.x)},${f(p.y - 5 * d.y + 6 * n.y)} L${f(p.x + 4 * d.x)},${f(p.y + 4 * d.y)} L${f(p.x - 5 * d.x - 6 * n.x)},${f(p.y - 5 * d.y - 6 * n.y)}`;
}
export function CicloDoDado() {
  const [sel, setSel] = useState(0);
  const e = ETAPAS[sel];
  return (
    <Figura tag="Interativo" legenda="O caminho de um dado do cliente, da conversa até o fim. Toque numa etapa ou use os botões.">
      <div className="mv-et-cd">
        <svg className="mv-et-cd-svg" viewBox="14 8 332 320" role="img"
          aria-label="Ciclo em cinco etapas: o dado chega, você confere, o cliente é cadastrado, o dado serve ao processo e nada de cópias soltas.">
          <circle className="mv-et-cd-anel" cx={CC} cy={CC} r={RA} />
          {ANG.map((a) => <path key={a} className="mv-et-cd-seta" d={seta(a + 36)} />)}
          <text className="mv-et-cd-c1" x={CC} y={CC - 3} textAnchor="middle">O caminho</text>
          <text className="mv-et-cd-c1" x={CC} y={CC + 17} textAnchor="middle">do dado</text>
          {ETAPAS.map((et, i) => {
            const p = noPos(ANG[i]);
            const duas = et.rot.length > 1;
            return (
              <g key={et.t} className="mv-et-cd-no" data-ativo={sel === i ? '' : undefined} onClick={() => setSel(i)}>
                <circle cx={p.x} cy={p.y} r={RN} />
                <text className="mv-et-cd-nn" x={p.x} y={p.y - (duas ? 13 : 8)} textAnchor="middle">{i + 1}</text>
                {et.rot.map((l, k) => (
                  <text key={l} className="mv-et-cd-nt" x={p.x} y={p.y + (duas ? 4 + k * 14 : 9)} textAnchor="middle">{l}</text>
                ))}
              </g>
            );
          })}
        </svg>
        <div className="mv-et-cd-painel" aria-live="polite">
          <div className="mv-et-cd-cab">
            <small className="num">Etapa {sel + 1} de {ETAPAS.length}</small>
            <b>{e.t}</b>
          </div>
          <div className="mv-et-cd-lin" data-tom="azul">
            <span className="mv-et-cd-ic"><Icone id="olho" /></span>
            <div><small>O que acontece</small><span>{e.acontece}</span></div>
          </div>
          <div className="mv-et-cd-lin" data-tom="ambar">
            <span className="mv-et-cd-ic"><Icone id="alerta" /></span>
            <div><small>Onde mora o risco</small><span>{e.risco}</span></div>
          </div>
          <div className="mv-et-cd-lin" data-tom="verde">
            <span className="mv-et-cd-ic"><Icone id="escudo" /></span>
            <div><small>Seu cuidado</small><span>{e.cuidado}</span></div>
          </div>
          <div className="mv-et-cd-nav">
            <div className="mv-et-seg" role="group" aria-label="Escolher etapa">
              {ETAPAS.map((et, i) => (
                <button key={et.t} type="button" aria-pressed={sel === i} onClick={() => setSel(i)}
                  aria-label={`Etapa ${i + 1}: ${et.t}`}>{i + 1}</button>
              ))}
            </div>
            <button type="button" className="mv-et-bt" onClick={() => setSel((s) => (s + 1) % ETAPAS.length)}>
              {sel === ETAPAS.length - 1 ? 'Voltar ao início' : 'Próxima etapa'}
            </button>
          </div>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== 5. o print que mostra demais */
export function PrintSeguro() {
  const [modo, setModo] = useState<'inteiro' | 'recorte'>('inteiro');
  const inteiro = modo === 'inteiro';
  return (
    <Figura tag="Ilustração" legenda="Exemplo fictício. Antes de enviar um print, veja tudo o que foi junto e recorte só o que responde a sua dúvida.">
      <div className="mv-et-ps" data-modo={modo}>
        <div className="mv-et-seg" role="group" aria-label="Tipo de print">
          <button type="button" aria-pressed={inteiro} onClick={() => setModo('inteiro')}>Print da tela inteira</button>
          <button type="button" aria-pressed={!inteiro} onClick={() => setModo('recorte')}>Print recortado</button>
        </div>
        <div className="mv-et-ps-grade">
          <div className="mv-et-ps-tela" aria-hidden>
            <div className="mv-et-ps-notif mv-et-ps-z">
              <i className="mv-et-ps-mk num">1</i>
              <span className="mv-et-ps-nav">JR</span>
              <span><b>José R.</b> meu CPF é 987.65…</span>
            </div>
            <div className="mv-et-ps-corpo">
              <div className="mv-et-ps-lista mv-et-ps-z">
                <i className="mv-et-ps-mk num">2</i>
                <small>Conversas</small>
                <div data-ativa=""><b>Maria A. S.</b><span>segue o extrato</span></div>
                <div><b>José R.</b><span>segue meu RG</span></div>
                <div className="mv-et-ps-senha">
                  <i className="mv-et-ps-mk num">3</i>
                  <b>Antônia L.</b><span>a senha é ••••••••</span>
                </div>
                <div><b>Benedito C.</b><span>boa tarde</span></div>
              </div>
              <div className="mv-et-ps-doc mv-et-ps-foco">
                <span className="mv-et-ps-rec">Área do recorte</span>
                <b>Extrato de Empréstimo Consignado</b>
                <small>MARIA A. S. · CPF ***.456.789-**</small>
                <div className="mv-et-ps-tab">
                  <span>Banco</span><span>Parcela</span><span>Situação</span>
                  <span>BMG</span><span className="num">R$ 210,00</span><span>Ativo</span>
                  <span data-duvida="">Agibank</span><span data-duvida="" className="num">R$ 185,40</span><span data-duvida="">Ativo?</span>
                  <span>Mercantil</span><span className="num">R$ 96,10</span><span>Ativo</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mv-et-ps-leg" aria-live="polite">
            {inteiro ? (
              <>
                <b className="mv-et-ps-lt" data-tom="rubro">O que foi junto sem você ver</b>
                <ol>
                  <li><i className="num">1</i>A notificação de outro cliente, com o começo do CPF dele.</li>
                  <li><i className="num">2</i>Nomes e mensagens de outras conversas.</li>
                  <li><i className="num">3</i>A prévia de uma mensagem com senha.</li>
                </ol>
                <span className="mv-et-ps-res">Para tirar uma dúvida sobre a Dona Maria, você exporia três outras pessoas.</span>
              </>
            ) : (
              <>
                <b className="mv-et-ps-lt" data-tom="verde">Só o necessário</b>
                <ol>
                  <li><i><Mini><IcCheck /></Mini></i>Só o extrato da Dona Maria, que é o caso em dúvida.</li>
                  <li><i><Mini><IcCheck /></Mini></i>Nenhum dado de outro cliente.</li>
                  <li><i><Mini><IcCheck /></Mini></i>A linha da dúvida continua clara para o gestor.</li>
                </ol>
                <span className="mv-et-ps-res">Mesmo assim, mande só para quem vai ajudar a resolver.</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== 6. sinais de golpe × jeito CAF */
const PARES: { tema: string; ic: IconeId; golpe: string; caf: string }[] = [
  { tema: 'Dinheiro', ic: 'moeda', golpe: 'Pede taxa, PIX ou depósito para “liberar” um valor.', caf: 'Nada é pago antes. Os 30% saem só no final, do valor que o cliente receber.' },
  { tema: 'Senha e código', ic: 'cadeado', golpe: 'Exige a senha do banco ou o código que chegou por SMS, com pressa.', caf: 'Não pede código e não exige senha: oferece guiar. Se o cliente preferir passar a senha, ela serve só para os documentos.' },
  { tema: 'Promessa', ic: 'balao', golpe: 'Promete um valor certo e alto, “garantido”.', caf: 'Fala em análise e possibilidade, com prazo médio de 6 a 12 meses.' },
  { tema: 'Pressa', ic: 'relogio', golpe: '“Só hoje!”, “última chance”, “vai perder o direito”.', caf: 'O cliente decide no tempo dele e pode conversar com a família antes.' },
  { tema: 'Identidade', ic: 'pessoa', golpe: 'Não diz quem é, ou finge ser do INSS, do banco ou da Justiça.', caf: 'Diz o nome e que fala da CAF. O advogado tem nome: Dr. Rafael Menezes.' },
  { tema: 'Assinatura', ic: 'caneta', golpe: 'Manda link estranho para “assinar” ou “atualizar os dados”.', caf: 'As procurações são assinadas pelo gov.br, o canal oficial do governo.' },
];
export function SinaisGolpeConfianca() {
  return (
    <Figura tag="Infográfico" legenda="Por fora os dois falam de dinheiro, processo e documentos. Por dentro, as atitudes são opostas.">
      <div className="mv-et-sg">
        <div className="mv-et-sg-cab" aria-hidden>
          <span data-tom="rubro"><Mini><IcX /></Mini>Sinal de golpe</span>
          <span />
          <span data-tom="verde"><Mini><IcCheck /></Mini>Jeito CAF</span>
        </div>
        {PARES.map((p) => (
          <div key={p.tema} className="mv-et-sg-lin">
            <div className="mv-et-sg-g"><small className="mv-et-sg-rot">Golpe</small>{p.golpe}</div>
            <div className="mv-et-sg-tema"><span><Icone id={p.ic} /></span><b>{p.tema}</b></div>
            <div className="mv-et-sg-c"><small className="mv-et-sg-rot">CAF</small>{p.caf}</div>
          </div>
        ))}
      </div>
    </Figura>
  );
}

/* ===================================================================== 7. detector de golpe */
const MSGS: { texto: string; golpe: boolean; sinais: string[]; e: string }[] = [
  {
    texto: 'Parabéns! Seu processo de juros foi APROVADO. Para liberar os R$ 18.400, faça hoje um PIX de R$ 390 da taxa de liberação.',
    golpe: true, sinais: ['pede pagamento', 'valor certo', 'pressa'],
    e: 'Pagamento antecipado é a marca do golpe. Na CAF, o cliente não paga nada antes: os 30% saem no final, do valor que ele receber.',
  },
  {
    texto: 'Oi, aqui é da equipe da análise. Vai chegar um código de 6 números no seu celular. Me passa ele pra eu confirmar seu cadastro?',
    golpe: true, sinais: ['pede código'],
    e: 'Quem consegue o código de verificação de uma conta pode tomar essa conta, como o WhatsApp do cliente. A CAF nunca pede códigos.',
  },
  {
    texto: '🔒 Seus dados são usados somente para a consulta. *Nunca pedimos senhas, códigos ou qualquer pagamento.*',
    golpe: false, sinais: ['avisa a regra', 'sem pagamento'],
    e: 'É uma mensagem do robô da CAF no canal de juros abusivos, copiada como ela é (vem logo depois do pedido do CPF). O próprio aviso mostra a regra da casa.',
  },
  {
    texto: 'AVISO: seu benefício será BLOQUEADO em 24 horas. Clique no link e atualize seus dados.',
    golpe: true, sinais: ['medo', 'pressa', 'link'],
    e: 'Ameaça, prazo curto e link: o trio clássico do golpe. O cliente não deve clicar em nada.',
  },
  {
    texto: 'Dona Cida, as procurações estão prontas. A assinatura é feita na sua conta do gov.br, o site oficial do governo. Quer que eu te explique o passo a passo?',
    golpe: false, sinais: ['gov.br oficial', 'sem pressa'],
    e: 'É o caminho real da CAF: as procurações recebem assinatura digital pelo gov.br. Nada de pagamento, nada de link estranho.',
  },
  {
    texto: 'Sou o advogado do seu processo. Saiu a decisão a seu favor, mas para receber precisa pagar as custas hoje, por depósito.',
    golpe: true, sinais: ['finge ser advogado', 'pede pagamento', 'pressa'],
    e: 'É o golpe do falso advogado. Na CAF, ninguém pede pagamento para o cliente receber.',
  },
];
export function DetectorGolpe() {
  const [resp, setResp] = useState<Record<number, boolean>>({});
  const feitos = Object.keys(resp).length;
  const acertos = MSGS.filter((m, i) => resp[i] === m.golpe).length;
  return (
    <Figura tag="Interativo" legenda="Mensagens fictícias, menos a do robô (copiada como é). Decida: sinal de golpe ou jeito CAF?">
      <div className="mv-et-dg">
        {MSGS.map((m, i) => {
          const r = resp[i];
          const respondeu = r !== undefined;
          return (
            <div key={i} className="mv-et-dg-it" data-estado={!respondeu ? undefined : r === m.golpe ? 'certo' : 'errado'}>
              <div className="mv-et-dg-msg">
                <small className="num">Mensagem {i + 1}</small>
                <span>{m.texto}</span>
              </div>
              {!respondeu ? (
                <div className="mv-et-dg-bts">
                  <button type="button" className="mv-et-bt" data-tom="rubro" onClick={() => setResp((s) => ({ ...s, [i]: true }))}>
                    <Mini><IcX /></Mini>Sinal de golpe
                  </button>
                  <button type="button" className="mv-et-bt" data-tom="verde" onClick={() => setResp((s) => ({ ...s, [i]: false }))}>
                    <Mini><IcCheck /></Mini>Jeito CAF
                  </button>
                </div>
              ) : (
                <div className="mv-et-dg-r" role="status">
                  <b>{r === m.golpe ? 'Acertou.' : 'Errou.'} {m.golpe ? 'É golpe.' : 'É o jeito CAF.'}</b>
                  <span className="mv-et-dg-chips">
                    {m.sinais.map((s) => <em key={s} data-tom={m.golpe ? 'rubro' : 'verde'}>{s}</em>)}
                  </span>
                  <span>{m.e}</span>
                </div>
              )}
            </div>
          );
        })}
        {feitos === MSGS.length && (
          <div className="mv-et-fim" role="status">
            <b className="num">{acertos} de {MSGS.length}</b> acertos.
            <button type="button" className="mv-link" onClick={() => setResp({})}>Fazer de novo</button>
          </div>
        )}
      </div>
    </Figura>
  );
}

/* ===================================================================== 8. os quatro "nunca" */
const NUNCAS: { t: string; ic: IconeId; oq: string; pq: string; vez: string }[] = [
  {
    t: 'Pedir pagamento', ic: 'moeda',
    oq: 'Nenhuma taxa, PIX, depósito, “custo de cadastro” ou adiantamento, por nenhum motivo.',
    pq: 'Pedir dinheiro antes é a marca registrada do golpe. Na CAF o cliente não paga nada para começar: os 30% saem no final, do valor que ele receber.',
    vez: '“O senhor não paga nada para começar.”',
  },
  {
    t: 'Pedir código ao cliente', ic: 'celular',
    oq: 'O código de verificação que chega por SMS ou aplicativo: do WhatsApp, do banco ou de qualquer conta do cliente.',
    pq: 'O código prova que é o dono da conta. Com ele, um golpista toma o WhatsApp do cliente e pede dinheiro aos contatos. Se o gov.br pedir um código enquanto você usa a senha do cliente, pare e fale com o gestor.',
    vez: '“Se alguém pedir um código em nosso nome, não passe.”',
  },
  {
    t: 'Prometer valores', ic: 'balao',
    oq: 'Nada de “vai receber 20 mil”, “é garantido” ou “o empréstimo vai sair”.',
    pq: 'Ninguém sabe o valor antes do processo, nem se a margem ou a portabilidade vão dar certo antes da análise. Promessa que não se cumpre vira cliente enganado.',
    vez: '“Não dá para prometer valor: depende da análise e do processo.”',
  },
  {
    t: 'Pressionar', ic: 'relogio',
    oq: 'Nada de “só hoje”, “última chance”, medo, nem mensagem atrás de mensagem depois de um não.',
    pq: 'Pressão tira do cliente o tempo de pensar. É o que o golpista faz, e é o que mais assusta quem já desconfia.',
    vez: '“Pode pensar com calma e conversar com a família.”',
  },
];
export function QuatroNuncas() {
  return (
    <Figura tag="Infográfico" legenda="As quatro atitudes que o atendente da CAF nunca tem, com o porquê e o que dizer no lugar.">
      <div className="mv-et-qn">
        {NUNCAS.map((n) => (
          <div key={n.t} className="mv-et-qn-it">
            <div className="mv-et-qn-cab">
              <span className="mv-et-qn-ic"><Icone id={n.ic} /><i aria-hidden /></span>
              <span><small>Nunca</small><b>{n.t}</b></span>
            </div>
            <span className="mv-et-qn-oq">{n.oq}</span>
            <span className="mv-et-qn-pq"><em>Por quê:</em> {n.pq}</span>
            <span className="mv-et-qn-vez"><small>Diga assim</small>{n.vez}</span>
          </div>
        ))}
      </div>
    </Figura>
  );
}

/* ===================================================================== 9. régua da persuasão */
const DEGRAUS: { t: string; d: string; ex: string; ok: boolean }[] = [
  { t: 'Informar', d: 'Explicar o processo, os 30% e o prazo médio.', ok: true, ex: '“O advogado entra com uma ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos no seu empréstimo pessoal. Leva em média de 6 a 12 meses, e o resultado depende da análise.”' },
  { t: 'Esclarecer', d: 'Responder dúvidas e medos com paciência.', ok: true, ex: '“Boa pergunta! Os 30% só existem no final, e saem do valor que a senhora receber.”' },
  { t: 'Recomendar', d: 'Mostrar por que pode valer a pena para ele.', ok: true, ex: '“Pelo que a senhora me contou, vale fazer a análise. Ela é gratuita, e a senhora só decide depois de entender tudo.”' },
  { t: 'Pressionar', d: 'Pressa falsa, medo, insistir depois do não.', ok: false, ex: '“Se não mandar os documentos hoje, a senhora perde o direito!”' },
  { t: 'Enganar', d: 'Prometer valor, esconder os 30%.', ok: false, ex: '“A senhora vai receber uns R$ 20 mil, garantido, e não paga nada.”' },
];
export function ReguaPersuasao() {
  const [sel, setSel] = useState(0);
  const d = DEGRAUS[sel];
  return (
    <Figura tag="Interativo" legenda="Da informação ao engano. Toque em cada degrau para ver uma frase de exemplo.">
      <div className="mv-et-rp">
        <div className="mv-et-rp-grade">
          <span className="mv-et-rp-rot" data-lado="ok" data-col="ok">Venda com ética</span>
          {DEGRAUS.slice(0, 3).map((g, i) => (
            <button key={g.t} type="button" className="mv-et-rp-d" data-lado="ok" data-col={i + 1}
              aria-pressed={sel === i} onClick={() => setSel(i)}>
              <span className="mv-et-rp-n num">{i + 1}</span><b>{g.t}</b><small>{g.d}</small>
            </button>
          ))}
          <span className="mv-et-rp-sep" data-col="sep" aria-hidden><em>a linha</em></span>
          <span className="mv-et-rp-rot" data-lado="nao" data-col="nao">Abuso</span>
          {DEGRAUS.slice(3).map((g, k) => (
            <button key={g.t} type="button" className="mv-et-rp-d" data-lado="nao" data-col={k + 4}
              aria-pressed={sel === k + 3} onClick={() => setSel(k + 3)}>
              <span className="mv-et-rp-n num">{k + 4}</span><b>{g.t}</b><small>{g.d}</small>
            </button>
          ))}
        </div>
        <div className="mv-et-rp-ex" data-lado={d.ok ? 'ok' : 'nao'} aria-live="polite">
          <small>{d.ok ? 'Pode: ' : 'Passou da linha: '}{d.t.toLowerCase()}</small>
          <span>{d.ex}</span>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== 10. semáforo das situações delicadas */
type Cor = 'verde' | 'ambar' | 'vermelho';
const CORES: { c: Cor; t: string; d: string }[] = [
  { c: 'verde', t: 'Segue, com paciência', d: 'Faz parte do atendimento normal.' },
  { c: 'ambar', t: 'Desacelera e confirma', d: 'Para de avançar e confirma o entendimento.' },
  { c: 'vermelho', t: 'Para e chama o gestor', d: 'Não decida sozinho. Nada de documento ou assinatura antes.' },
];
const DELICADAS: { s: string; r: Cor; e: string }[] = [
  { s: 'O Seu Benedito pergunta pela terceira vez o que são os 30%. Está calmo, só quer entender direito.', r: 'verde', e: 'Repetir faz parte. Explique de novo, com calma e com o exemplo dos R$ 10 mil. Quem pergunta está prestando atenção.' },
  { s: 'A Dona Cida não lembra que falou com você ontem, acha que você é do banco e diz que “já pagou a taxa”.', r: 'vermelho', e: 'Confusão sobre quem você é e uma “taxa” que a CAF não cobra: pode ser um golpe de outra pessoa ou uma dificuldade de entendimento. Não avance; chame o gestor.' },
  { s: 'A filha da cliente responde: “Minha mãe é interditada. Eu sou a curadora dela.”', r: 'vermelho', e: 'Curatela muda quem pode decidir e assinar pela pessoa. É caso para o gestor, antes de qualquer documento.' },
  { s: 'O Seu Antônio diz: “Gostei, mas quero conversar com o meu filho antes.”', r: 'verde', e: 'É direito dele decidir em família. Respeite, ofereça ajuda para explicar ao filho e combine quando retomar.' },
  { s: 'Um sobrinho entra na conversa, pede pressa e quer que “o dinheiro caia na conta dele”.', r: 'vermelho', e: 'Alguém pressionando e querendo o dinheiro do cliente para si é sinal de alerta. Não siga com o sobrinho; chame o gestor.' },
  { s: 'A Dona Lurdes responde coisas sem relação com as perguntas e, depois de duas explicações, ainda não sabe o que é o processo.', r: 'ambar', e: 'Pare de pedir documentos. Explique de novo, em frases curtas, e peça para ela contar com as palavras dela o que entendeu. Se continuar confusa, chame o gestor antes de seguir.' },
  { s: 'Um parente manda mensagem de outro número pedindo informações do processo do cliente.', r: 'ambar', e: 'Os dados são do cliente. Não passe informação a outra pessoa sem a autorização dele. Confirme com o próprio cliente e, na dúvida, fale com o gestor.' },
];
export function SemaforoDelicadas() {
  const [resp, setResp] = useState<Record<number, Cor>>({});
  const feitos = Object.keys(resp).length;
  const acertos = DELICADAS.filter((d, i) => resp[i] === d.r).length;
  const nome = (c: Cor) => CORES.find((x) => x.c === c)?.t ?? '';
  return (
    <Figura tag="Interativo" legenda="Casos fictícios. Para cada um, escolha a cor do semáforo e veja o que fazer.">
      <div className="mv-et-sf">
        <div className="mv-et-sf-cab">
          <svg className="mv-et-sf-svg" viewBox="0 0 56 140" role="img" aria-label="Semáforo com três luzes: vermelho, amarelo e verde.">
            <rect className="mv-et-sf-caixa" x="6" y="4" width="44" height="132" rx="14" />
            <circle className="mv-et-sf-l" data-c="vermelho" cx="28" cy="32" r="13" />
            <circle className="mv-et-sf-l" data-c="ambar" cx="28" cy="70" r="13" />
            <circle className="mv-et-sf-l" data-c="verde" cx="28" cy="108" r="13" />
          </svg>
          <ul className="mv-et-sf-leg">
            {[...CORES].reverse().map((c) => (
              <li key={c.c} data-c={c.c}><i aria-hidden /><span><b>{c.t}</b><small>{c.d}</small></span></li>
            ))}
          </ul>
        </div>
        {DELICADAS.map((d, i) => {
          const r = resp[i];
          return (
            <div key={i} className="mv-et-sf-it" data-estado={r === undefined ? undefined : r === d.r ? 'certo' : 'errado'}>
              <span className="mv-et-sf-s">{d.s}</span>
              {r === undefined ? (
                <div className="mv-et-sf-bts" role="group" aria-label="Escolha a cor">
                  {CORES.map((c) => (
                    <button key={c.c} type="button" data-c={c.c} onClick={() => setResp((s) => ({ ...s, [i]: c.c }))}>
                      <i aria-hidden />{c.t}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mv-et-sf-r" role="status">
                  <span className="mv-et-sf-tag" data-c={d.r}><i aria-hidden />{nome(d.r)}</span>
                  <span><b>{r === d.r ? 'Acertou.' : 'Não é bem isso.'}</b> {d.e}</span>
                </div>
              )}
            </div>
          );
        })}
        {feitos === DELICADAS.length && (
          <div className="mv-et-fim" role="status">
            <b className="num">{acertos} de {DELICADAS.length}</b> acertos.
            <button type="button" className="mv-link" onClick={() => setResp({})}>Fazer de novo</button>
          </div>
        )}
      </div>
    </Figura>
  );
}

/* ===================================================================== 11. pode ou não pode? */
const CASOS: { s: string; pode: boolean; e: string }[] = [
  { s: 'O cliente passou a senha do gov.br. Você entra, baixa os documentos do Meu INSS e sai da conta.', pode: true, e: 'É exatamente para isso que a senha serve. Falta só um passo: ajudar o cliente a trocar a senha.' },
  { s: 'Já que está na conta, você dá uma olhada em outros serviços para ver se o cliente tem mais algum direito.', pode: false, e: 'A senha foi confiada para buscar os documentos. Qualquer outro uso, mesmo com boa intenção, quebra essa confiança.' },
  { s: 'Você anota a senha num papel ao lado do teclado, para não esquecer até terminar.', pode: false, e: 'Senha não se anota em lugar nenhum. Papel fica à vista, se perde e vira senha de qualquer um.' },
  { s: 'Para tirar uma dúvida com o gestor, você manda um print do extrato recortando só a linha que importa.', pode: true, e: 'Dentro do trabalho, para quem vai ajudar, mostrando só o necessário. É assim.' },
  { s: 'Você manda a foto do RG do cliente para um amigo que “entende de documento”.', pode: false, e: 'Dado de cliente não sai do trabalho, por nenhum motivo. A dúvida vai para o gestor.' },
  { s: 'A cliente pergunta por que precisamos da foto do rosto. Você explica que é para confirmar que é ela mesma fazendo, e não outra pessoa no nome dela.', pode: true, e: 'Transparência: o cliente tem direito de saber para que serve cada dado. Essa é a resposta oficial.' },
  { s: 'Para “garantir a vaga” do cliente no processo, você pede um PIX de R$ 50.', pode: false, e: 'A CAF nunca pede dinheiro adiantado. Isso é exatamente o que os golpistas fazem.' },
  { s: 'O cliente disse que não quer seguir. Você agradece com carinho, diz que a análise fica à disposição e não insiste.', pode: true, e: 'Não é não. Agradecer e deixar a porta aberta é o padrão da casa, igual ao do robô.' },
];
export function PodeOuNaoPode() {
  const [resp, setResp] = useState<Record<number, boolean>>({});
  const feitos = Object.keys(resp).length;
  const acertos = CASOS.filter((c, i) => resp[i] === c.pode).length;
  return (
    <Figura tag="Interativo" legenda="Treino com situações do dia a dia. Responda e leia a explicação.">
      <div className="mv-et-pn">
        {CASOS.map((c, i) => {
          const r = resp[i];
          const respondeu = r !== undefined;
          return (
            <div key={i} className="mv-et-pn-it" data-estado={!respondeu ? undefined : r === c.pode ? 'certo' : 'errado'}>
              <span className="mv-et-pn-s"><small className="num">{String(i + 1).padStart(2, '0')}</small>{c.s}</span>
              {!respondeu ? (
                <div className="mv-et-pn-bts">
                  <button type="button" className="mv-et-bt" data-tom="verde" onClick={() => setResp((s) => ({ ...s, [i]: true }))}>
                    <Mini><IcCheck /></Mini>Pode
                  </button>
                  <button type="button" className="mv-et-bt" data-tom="rubro" onClick={() => setResp((s) => ({ ...s, [i]: false }))}>
                    <Mini><IcX /></Mini>Não pode
                  </button>
                </div>
              ) : (
                <span className="mv-et-pn-r" role="status">
                  <b>{r === c.pode ? 'Acertou:' : 'Errou:'} {c.pode ? 'pode.' : 'não pode.'}</b> {c.e}
                </span>
              )}
            </div>
          );
        })}
        {feitos === CASOS.length && (
          <div className="mv-et-fim" role="status">
            <b className="num">{acertos} de {CASOS.length}</b> acertos.
            <button type="button" className="mv-link" onClick={() => setResp({})}>Fazer de novo</button>
          </div>
        )}
      </div>
    </Figura>
  );
}

/* ===================================================================== 12. cartaz do combinado */
const NUNCA_FACA = [
  'Pedir pagamento, taxa ou PIX, por nenhum motivo',
  'Pedir ao cliente código de SMS ou de verificação',
  'Pedir a senha do banco do cliente',
  'Prometer valor, prazo certo ou resultado',
  'Pressionar: pressa falsa, medo, insistir depois do não',
  'Anotar senha ou copiar dado de cliente por conta própria',
  'Usar a senha para qualquer coisa além dos documentos',
  'Compartilhar dado de cliente fora do trabalho',
  'Esconder ou diminuir os 30% de honorários',
  'Chamar o processo de “revisão do consignado”',
  'Decidir sozinho um caso delicado',
];
const SEMPRE_FACA = [
  'Dizer quem você é e que fala da CAF',
  'Explicar os 30% com clareza, com um exemplo',
  'Dizer que o processo revisa os juros do empréstimo pessoal',
  'Pedir só o que o processo precisa, e dizer para quê',
  'Oferecer guiar o cliente antes de falar em senha',
  'Ajudar o cliente a trocar a senha depois',
  'Conferir para quem vai antes de enviar, e recortar o print',
  'Respeitar o tempo, a família e o não do cliente',
  'Agradecer com carinho quem diz não ou não é elegível',
  'Avisar o gestor na hora se algo der errado',
  'Chamar o gestor em caso de confusão, curatela ou representação',
];
export function CartazCompromisso() {
  const [ok, setOk] = useState<Set<string>>(() => new Set());
  const total = NUNCA_FACA.length + SEMPRE_FACA.length;
  function alternar(k: string) {
    setOk((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  const coluna = (tipo: 'nunca' | 'sempre', itens: string[]) => (
    <div className="mv-et-cz-col" data-tipo={tipo}>
      <span className="mv-et-cz-tit">{tipo === 'nunca' ? <Mini><IcX /></Mini> : <Mini><IcCheck /></Mini>}{tipo === 'nunca' ? 'Nunca faça' : 'Sempre faça'}</span>
      <ul>
        {itens.map((t) => {
          const k = `${tipo}:${t}`;
          return (
            <li key={k}>
              <button type="button" aria-pressed={ok.has(k)} onClick={() => alternar(k)}>
                <span className="mv-et-cz-box" aria-hidden>{ok.has(k) && <Mini><IcCheck /></Mini>}</span>
                <span>{t}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
  return (
    <Figura tag="Interativo" legenda="O combinado do atendente. Marque cada linha quando ela já for um hábito seu.">
      <div className="mv-et-cz">
        <div className="mv-et-cz-cab">
          <span className="mv-et-cz-selo"><Icone id="escudo" /></span>
          <span><b>O combinado do atendente</b><small>Segurança, ética e LGPD em {total} linhas</small></span>
          <span className="mv-et-cz-prog num">{ok.size} de {total}</span>
        </div>
        <div className="mv-et-cz-barra" aria-hidden><i style={{ width: `${(ok.size / total) * 100}%` }} /></div>
        <div className="mv-et-cz-grade">
          {coluna('nunca', NUNCA_FACA)}
          {coluna('sempre', SEMPRE_FACA)}
        </div>
        {ok.size === total && (
          <div className="mv-et-fim" role="status">
            <b>Combinado fechado.</b> É isso que faz o cliente confiar na CAF, mensagem após mensagem.
          </div>
        )}
      </div>
    </Figura>
  );
}

/* ===================================================================== 13. o nome certo (pessoal × consignado) */
const DIFERENCA: { tom: 'azul' | 'ambar'; t: string; quem: string; regra: string; conversa: string; selo?: string }[] = [
  {
    tom: 'azul', t: 'Empréstimo consignado',
    quem: 'O INSS desconta a parcela direto do benefício, antes de o dinheiro cair na conta.',
    regra: 'Usa a margem consignável e tem teto de juros.',
    conversa: 'Assunto dos ganchos do canal de empréstimo: aumento de margem e portabilidade dos consignados.',
  },
  {
    tom: 'ambar', t: 'Empréstimo pessoal', selo: 'O processo olha aqui',
    quem: 'A financeira cobra a parcela fora do INSS, em geral na conta do cliente.',
    regra: 'Não usa a margem; os juros são livres e, em geral, bem mais altos.',
    conversa: 'É o objeto do processo: a revisão dos juros e o pedido de ressarcimento.',
  },
];
const TROCAS: { ctx: string; errada: string; certa: string; pq: string }[] = [
  {
    ctx: 'Explicando o processo',
    errada: '“Vamos revisar o seu consignado.”',
    certa: '“Vamos analisar os juros do empréstimo pessoal que a senhora fez com a financeira.”',
    pq: 'O processo é sobre os juros do empréstimo pessoal. Com o nome errado, o cliente decide achando que é outra coisa.',
  },
  {
    ctx: 'Perguntando a porta 3',
    errada: '“Aparece algum desconto da Agibank no seu benefício?”',
    certa: '“A senhora tem empréstimo pessoal com Agibank, BMG, Facta, Mercantil ou Crefisa? É aquele que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício.”',
    pq: 'Desconto no benefício é o consignado. A porta 3 pergunta pelo empréstimo pessoal; se o cliente não souber a diferença, explique com uma frase simples.',
  },
  {
    ctx: 'Falando dos juros',
    errada: '“O desconto que o INSS faz no seu benefício tem juros abusivos.”',
    certa: '“Os juros que a gente analisa são os do empréstimo pessoal, que a financeira cobra fora do INSS.”',
    pq: 'O consignado que o INSS desconta tem teto de juros. É no empréstimo pessoal, de juros livres, que aparecem os juros abusivos que a CAF revisa.',
  },
  {
    ctx: 'No canal de empréstimo, sem margem',
    errada: '“Não tem margem, mas a gente resolve revisando o seu consignado.”',
    certa: '“Hoje não há margem para um consignado novo. Podemos ver a possibilidade de aumento de margem, a portabilidade dos consignados e, se a senhora tiver empréstimo pessoal numa dessas financeiras, a revisão dos juros dele.”',
    pq: 'Margem e portabilidade são assuntos do consignado; o processo é sobre o empréstimo pessoal. Cada caminho com o seu nome, e todos como possibilidade, nunca como garantia.',
  },
];
export function FraseCerta() {
  const [abertas, setAbertas] = useState<Set<number>>(() => new Set());
  const todas = abertas.size === TROCAS.length;
  const abrir = (i: number) => setAbertas((s) => new Set(s).add(i));
  return (
    <Figura tag="Interativo" legenda="Frases de exemplo: as certas são sugestão de roteiro, adapte ao cliente. Toque em “Corrigir a frase” para ver o nome certo e o porquê. A diferença completa está na lição 3.">
      <div className="mv-et-fc">
        <div className="mv-et-fc-dif">
          {DIFERENCA.map((d) => (
            <div key={d.t} className="mv-et-fc-card" data-tom={d.tom}>
              <div className="mv-et-fc-ct">
                <b>{d.t}</b>
                {d.selo && <em className="mv-et-fc-selo">{d.selo}</em>}
              </div>
              <span>{d.quem}</span>
              <span>{d.regra}</span>
              <span className="mv-et-fc-na"><small>Na conversa</small>{d.conversa}</span>
            </div>
          ))}
        </div>
        <div className="mv-et-fc-topo">
          <b>Quatro frases que escapam sem perceber</b>
          <button type="button" className="mv-et-bt" disabled={todas}
            onClick={() => setAbertas(new Set(TROCAS.map((_, i) => i)))}>Corrigir todas</button>
        </div>
        <ol className="mv-et-fc-lista">
          {TROCAS.map((t, i) => {
            const aberta = abertas.has(i);
            return (
              <li key={t.ctx} className="mv-et-fc-it" data-aberta={aberta ? '' : undefined}>
                <small className="mv-et-fc-ctx"><i className="num">{i + 1}</i>{t.ctx}</small>
                <div className="mv-et-fc-par">
                  <div className="mv-et-fc-b" data-tom="rubro">
                    <span className="mv-et-fc-rot"><Mini><IcX /></Mini>Nome errado</span>
                    <span>{t.errada}</span>
                  </div>
                  {aberta ? (
                    <div className="mv-et-fc-b" data-tom="verde" role="status">
                      <span className="mv-et-fc-rot"><Mini><IcCheck /></Mini>Nome certo</span>
                      <span>{t.certa}</span>
                    </div>
                  ) : (
                    <div className="mv-et-fc-vazio">
                      <button type="button" className="mv-et-bt" data-tom="azul" onClick={() => abrir(i)}>Corrigir a frase</button>
                    </div>
                  )}
                </div>
                {aberta && <span className="mv-et-fc-pq"><em>Por quê:</em> {t.pq}</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </Figura>
  );
}
