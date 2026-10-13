/* Lição 04 — peças interativas: a árvore das 3 portas (clicável, o caminho
   acende conforme as respostas), o treino "Pessoal ou consignado?", o tradutor
   de jargão e o treino "Atende ou descarta?" com 14 casos. Estado local, nada
   é salvo. A porta 3 é sobre EMPRÉSTIMO PESSOAL (correção do dono, 13/10). */
import { useState } from 'react';
import { copiar, IcCheck, IcX } from '../pecas';

/* ===================================================================== botão de copiar */
function BotaoCopiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  async function aoCopiar() {
    if (await copiar(texto)) { setOk(true); window.setTimeout(() => setOk(false), 1500); }
  }
  return (
    <button type="button" className="mv-cli-copiar" onClick={aoCopiar} aria-label="Copiar esta mensagem">
      {ok ? 'Copiado' : 'Copiar'}
    </button>
  );
}

/* ===================================================================== árvore das 3 portas */
type NoId = 'p1' | 'p2' | 'p3' | 'p3b' | 'ok' | 'okSegue' | 'neNinguem' | 'neFin';
type Pergunta = 'p1' | 'p2' | 'p3' | 'p3b';
type Final = 'ok' | 'okSegue' | 'neNinguem' | 'neFin';
type Ponto = [number, number];

const ALT = 60; // altura de cada caixa
const NOS: { id: NoId; x: number; y: number; w: number; tipo: 'porta' | 'meio' | 'ok' | 'ne'; tag: string; t: string }[] = [
  { id: 'p1', x: 150, y: 16, w: 300, tipo: 'porta', tag: 'PORTA 1', t: 'Recebe algum benefício do INSS?' },
  { id: 'p2', x: 470, y: 120, w: 270, tipo: 'porta', tag: 'PORTA 2', t: 'Algum familiar recebe do INSS?' },
  { id: 'neNinguem', x: 560, y: 240, w: 180, tipo: 'ne', tag: 'NÃO ELEGÍVEL', t: 'Agradece e encerra' },
  { id: 'p3', x: 110, y: 240, w: 360, tipo: 'porta', tag: 'PORTA 3', t: 'Empréstimo pessoal numa das 5 financeiras?' },
  { id: 'ok', x: 20, y: 364, w: 200, tipo: 'ok', tag: 'ELEGÍVEL', t: 'Segue o atendimento' },
  { id: 'p3b', x: 270, y: 364, w: 220, tipo: 'meio', tag: 'PERGUNTE DE NOVO', t: 'Uma vez, explicando' },
  { id: 'neFin', x: 540, y: 364, w: 200, tipo: 'ne', tag: 'NÃO ELEGÍVEL', t: 'Só trabalhamos com essas' },
  { id: 'okSegue', x: 270, y: 468, w: 220, tipo: 'ok', tag: 'SEGUE EM FRENTE', t: 'Sem travar a conversa' },
];

const ARESTAS: { id: string; pts: Ponto[]; rot: string; lx: number; ly: number; anc: 'start' | 'middle' }[] = [
  { id: 'p1-sim', pts: [[300, 76], [300, 238]], rot: 'Sim', lx: 310, ly: 162, anc: 'start' },
  { id: 'p1-nao', pts: [[450, 46], [605, 46], [605, 118]], rot: 'Não', lx: 528, ly: 38, anc: 'middle' },
  { id: 'p2-sim', pts: [[530, 180], [530, 270], [472, 270]], rot: 'Sim', lx: 538, ly: 226, anc: 'start' },
  { id: 'p2-nao', pts: [[680, 180], [680, 238]], rot: 'Não', lx: 688, ly: 214, anc: 'start' },
  { id: 'p3-sim', pts: [[180, 300], [180, 332], [120, 332], [120, 362]], rot: 'Sim', lx: 150, ly: 325, anc: 'middle' },
  { id: 'p3-naosei', pts: [[380, 300], [380, 362]], rot: 'Não sei', lx: 388, ly: 338, anc: 'start' },
  { id: 'p3-nao', pts: [[440, 300], [440, 332], [640, 332], [640, 362]], rot: 'Não, ou só consignado', lx: 540, ly: 325, anc: 'middle' },
  { id: 'p3b-sim', pts: [[270, 394], [222, 394]], rot: 'Tem', lx: 246, ly: 386, anc: 'middle' },
  { id: 'p3b-nao', pts: [[490, 394], [538, 394]], rot: 'Não', lx: 514, ly: 386, anc: 'middle' },
  { id: 'p3b-naosei', pts: [[380, 424], [380, 466]], rot: 'Segue sem saber', lx: 388, ly: 450, anc: 'start' },
];

/** Triângulo da ponta da seta, alinhado ao último trecho da linha. */
function ponta(pts: Ponto[]): string {
  const [x2, y2] = pts[pts.length - 1];
  const [x1, y1] = pts[pts.length - 2];
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const bx = x2 - ux * 9, by = y2 - uy * 9;
  return `${x2},${y2} ${bx - uy * 5},${by + ux * 5} ${bx + uy * 5},${by - ux * 5}`;
}

type Opcao = { rotulo: string; aresta: string; para: NoId; tom: 'verde' | 'rubro' | 'ambar' };
/* `fraseFamiliar`: na rota do familiar, a pergunta da porta 3 é sobre o empréstimo DELE, não de quem escreve. */
const PERGUNTAS: Record<Pergunta, { passo: string; pergunta: string; dica: string; frase: string; fraseFamiliar?: string; opcoes: Opcao[] }> = {
  p1: {
    passo: 'Porta 1',
    pergunta: 'A pessoa recebe algum benefício do INSS?',
    dica: 'Qualquer benefício serve: aposentadoria, pensão, auxílio ou BPC/LOAS. Pergunte pelo benefício, não só pela aposentadoria.',
    frase: 'O(a) senhor(a) recebe algum benefício do INSS? Pode ser aposentadoria, pensão, auxílio ou BPC/LOAS.',
    opcoes: [
      { rotulo: 'Sim, recebe', aresta: 'p1-sim', para: 'p3', tom: 'verde' },
      { rotulo: 'Não recebe', aresta: 'p1-nao', para: 'p2', tom: 'rubro' },
    ],
  },
  p2: {
    passo: 'Porta 2',
    pergunta: 'Algum familiar recebe benefício do INSS?',
    dica: 'Vale pai, mãe, avó, avô ou filho. Se sim, a análise segue pelo benefício do familiar, e os documentos passam a ser dele.',
    frase: 'Entendi! E alguém da sua família recebe benefício do INSS? Pai, mãe, avô, avó ou filho?',
    opcoes: [
      { rotulo: 'Sim, um familiar recebe', aresta: 'p2-sim', para: 'p3', tom: 'verde' },
      { rotulo: 'Ninguém recebe', aresta: 'p2-nao', para: 'neNinguem', tom: 'rubro' },
    ],
  },
  p3: {
    passo: 'Porta 3',
    pergunta: 'Tem empréstimo pessoal em alguma das 5 financeiras?',
    dica: 'Agibank, BMG, Facta, Mercantil ou Crefisa. Vale o empréstimo pessoal, que a financeira cobra fora do INSS; consignado, que o INSS desconta do benefício, não abre a porta 3. Na rota do familiar, a pergunta é sobre o empréstimo do familiar.',
    frase: 'E o(a) senhor(a) tem algum empréstimo pessoal com um destes bancos: Agibank, BMG, Facta, Mercantil ou Crefisa?',
    fraseFamiliar: 'E essa pessoa da sua família tem algum empréstimo pessoal com um destes bancos: Agibank, BMG, Facta, Mercantil ou Crefisa?',
    opcoes: [
      { rotulo: 'Sim, tem pessoal numa das 5', aresta: 'p3-sim', para: 'ok', tom: 'verde' },
      { rotulo: 'Não sabe', aresta: 'p3-naosei', para: 'p3b', tom: 'ambar' },
      { rotulo: 'Não tem, ou só tem consignado', aresta: 'p3-nao', para: 'neFin', tom: 'rubro' },
    ],
  },
  p3b: {
    passo: 'Porta 3 · segunda tentativa',
    pergunta: 'Ele não soube dizer. Pergunte de novo, uma vez só.',
    dica: 'Cite as 5 pelo nome e explique a diferença numa frase: é o empréstimo que a financeira cobra na conta, e não o que o INSS desconta direto do benefício. Se continuar sem saber, siga em frente.',
    frase: 'É aquele empréstimo que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício. O(a) senhor(a) tem algum assim com Agibank, BMG, Facta, Mercantil ou Crefisa?',
    fraseFamiliar: 'É aquele empréstimo que a financeira cobra na conta, e não o que o INSS desconta direto do benefício. Essa pessoa da sua família tem algum assim com Agibank, BMG, Facta, Mercantil ou Crefisa?',
    opcoes: [
      { rotulo: 'Lembrou: tem', aresta: 'p3b-sim', para: 'ok', tom: 'verde' },
      { rotulo: 'Lembrou: não tem', aresta: 'p3b-nao', para: 'neFin', tom: 'rubro' },
      { rotulo: 'Continua sem saber', aresta: 'p3b-naosei', para: 'okSegue', tom: 'ambar' },
    ],
  },
};

const MSG_SEM_BENEFICIO = 'Muito obrigado por conversar com a gente! 😊\nHoje o nosso trabalho é só para quem recebe algum benefício do INSS, ou tem um familiar que recebe. Por isso, neste caso, não temos como fazer a análise.\nAgradeço muito a sua confiança. Se precisar, é só chamar aqui.';
const MSG_SEM_FINANCEIRA = 'Obrigado pelas informações! 😊\nHoje a gente trabalha só com empréstimos pessoais do Agibank, BMG, Facta, Mercantil e Crefisa. Como o(a) senhor(a) não tem empréstimo pessoal com nenhum deles, não temos como seguir com a análise.\nAgradeço muito a sua confiança. Fico à disposição!';
/* Na rota do familiar, o empréstimo é do familiar, não de quem escreve. */
const MSG_SEM_FINANCEIRA_FAM = 'Obrigado pelas informações! 😊\nHoje a gente trabalha só com empréstimos pessoais do Agibank, BMG, Facta, Mercantil e Crefisa. Como o seu familiar não tem empréstimo pessoal com nenhum deles, não temos como seguir com a análise.\nAgradeço muito a sua confiança. Fico à disposição!';

function finalDe(no: Final, familiar: boolean): { tom: 'verde' | 'rubro' | 'ambar'; titulo: string; texto: string; msg?: string } {
  if (no === 'ok') {
    return familiar
      ? { tom: 'verde', titulo: 'Elegível pela rota do familiar', texto: 'A análise segue pelo benefício do familiar, e todos os documentos passam a ser dele, do Meu INSS ao e-mail. Peça o nome completo e o CPF do familiar e confirme que ele está de acordo. Depois, siga o atendimento normalmente.' }
      : { tom: 'verde', titulo: 'Elegível', texto: 'Passou pelas portas. Siga o atendimento: explique a análise e o processo e, depois, parta para os documentos.' };
  }
  if (no === 'okSegue') {
    return { tom: 'ambar', titulo: 'Segue em frente', texto: 'Você já perguntou de novo, uma vez. Não trave a conversa por isso: siga com o atendimento. Muitas vezes o cliente lembra depois, pelo débito na conta ou com a ajuda da família. A regra da porta 3 continua valendo: se ficar claro que não há empréstimo pessoal numa das 5, não é elegível. Na dúvida, fale com o seu gestor.' };
  }
  if (no === 'neNinguem') {
    return { tom: 'rubro', titulo: 'Não elegível', texto: 'Sem benefício do INSS, nem próprio nem de um familiar. Agradeça com carinho, explique o motivo em uma frase e encerre, sem insistir.', msg: MSG_SEM_BENEFICIO };
  }
  return { tom: 'rubro', titulo: 'Não elegível', texto: 'Não tem empréstimo pessoal em nenhuma das 5 financeiras, e só trabalhamos com essas. Ter só consignado, mesmo num desses bancos, não abre a porta 3. Agradeça com carinho e encerre, sem insistir.', msg: familiar ? MSG_SEM_FINANCEIRA_FAM : MSG_SEM_FINANCEIRA };
}

/** Árvore de decisão das 3 portas. Responda no painel e veja o caminho acender. */
export function ArvorePortas() {
  const [trilha, setTrilha] = useState<{ no: NoId; aresta?: string }[]>([{ no: 'p1' }]);
  const atual = trilha[trilha.length - 1].no;
  const visitados = new Set(trilha.map((t) => t.no));
  const tomadas = new Set(trilha.map((t) => t.aresta).filter(Boolean));
  const comecou = trilha.length > 1;
  const familiar = tomadas.has('p2-sim');

  function responder(o: Opcao) { setTrilha((t) => [...t, { no: o.para, aresta: o.aresta }]); }
  function voltar() { setTrilha((t) => (t.length > 1 ? t.slice(0, -1) : t)); }
  function recomecar() { setTrilha([{ no: 'p1' }]); }

  const ehPergunta = atual === 'p1' || atual === 'p2' || atual === 'p3' || atual === 'p3b';
  const fim = ehPergunta ? null : finalDe(atual as Final, familiar);
  const perg = ehPergunta ? PERGUNTAS[atual as Pergunta] : null;
  const frase = perg ? (familiar && perg.fraseFamiliar ? perg.fraseFamiliar : perg.frase) : '';

  return (
    <div className="mv-cli-arv">
      <figure className="vidro mv-cli-arv-fig">
        <svg className="mv-cli-svg" viewBox="0 0 760 540" role="img"
          aria-label="Árvore de decisão. Porta 1: recebe algum benefício do INSS? Sim leva à porta 3; não leva à porta 2. Porta 2: algum familiar recebe do INSS? Sim leva à porta 3; não, não elegível. Porta 3: tem empréstimo pessoal numa das 5 financeiras? Sim, elegível; não, ou só consignado, não elegível; não sei, pergunte de novo uma vez, e se continuar sem saber, segue em frente.">
          {ARESTAS.map((a) => {
            const on = tomadas.has(a.id);
            return (
              <g key={a.id} className="mv-cli-aresta" data-on={on ? '' : undefined} data-apagado={comecou && !on ? '' : undefined}>
                <path d={`M${a.pts.map((p) => p.join(',')).join(' L')}`} />
                <polygon points={ponta(a.pts)} />
                <text className="mv-cli-aresta-rot" x={a.lx} y={a.ly} textAnchor={a.anc}>{a.rot}</text>
              </g>
            );
          })}
          {NOS.map((n) => {
            const estado = n.id === atual ? 'atual' : visitados.has(n.id) ? 'feito' : comecou ? 'apagado' : undefined;
            const cx = n.x + n.w / 2;
            return (
              <g key={n.id} className="mv-cli-no" data-tipo={n.tipo} data-estado={estado}>
                <rect x={n.x} y={n.y} width={n.w} height={ALT} rx="12" />
                <text className="mv-cli-no-tag" x={cx} y={n.y + 24} textAnchor="middle">{n.tag}</text>
                <text className="mv-cli-no-t" x={cx} y={n.y + 45} textAnchor="middle">{n.t}</text>
              </g>
            );
          })}
        </svg>
      </figure>
      <p className="mv-cli-rolar-dica" aria-hidden>Árvore larga: arraste para o lado para ver tudo.</p>

      <div className="vidro mv-cli-arv-painel" data-tom={fim?.tom} aria-live="polite">
        {perg && (
          <>
            <span className="mv-cli-arv-passo">{perg.passo}{familiar && atual !== 'p2' ? ' · pelo familiar' : ''}</span>
            <p className="mv-cli-arv-p">{perg.pergunta}</p>
            <p className="mv-cli-arv-dica">{perg.dica}</p>
            <div className="mv-cli-frase">
              <div><small>Como perguntar (sugestão de roteiro, adapte ao cliente)</small><p>{frase}</p></div>
              <BotaoCopiar texto={frase} />
            </div>
            <div className="mv-cli-arv-ops" role="group" aria-label="Qual foi a resposta do cliente?">
              {perg.opcoes.map((o) => (
                <button key={o.aresta} type="button" className="mv-cli-btn" data-tom={o.tom} onClick={() => responder(o)}>{o.rotulo}</button>
              ))}
            </div>
          </>
        )}
        {fim && (
          <>
            <span className="mv-cli-arv-passo">Resultado</span>
            <p className="mv-cli-arv-p">{fim.titulo}</p>
            <p className="mv-cli-arv-dica">{fim.texto}</p>
            {fim.msg && (
              <div className="mv-cli-frase">
                <div><small>Mensagem para encerrar (sugestão de roteiro, adapte ao cliente)</small><p>{fim.msg}</p></div>
                <BotaoCopiar texto={fim.msg} />
              </div>
            )}
          </>
        )}
        <div className="mv-cli-arv-pe">
          <span>{comecou ? `${trilha.length - 1} resposta${trilha.length > 2 ? 's' : ''} dada${trilha.length > 2 ? 's' : ''}. Teste todos os caminhos.` : 'Escolha a resposta do cliente para ver o caminho acender.'}</span>
          {comecou && <button type="button" className="mv-link" onClick={voltar}>Voltar um passo</button>}
          {comecou && <button type="button" className="mv-link" onClick={recomecar}>Recomeçar</button>}
        </div>
      </div>
    </div>
  );
}

/* ===================================================================== pessoal ou consignado? */
type Tipo = 'consignado' | 'pessoal' | 'pergunte';
const TIPO_ROT: Record<Tipo, string> = { consignado: 'Consignado', pessoal: 'Empréstimo pessoal', pergunte: 'Não dá para saber: pergunte' };
const FRASES_TIPO: { fala: string; certa: Tipo; porque: string }[] = [
  { fala: 'O INSS já desconta a parcela direto da minha aposentadoria.', certa: 'consignado', porque: 'Desconto feito pelo INSS no benefício é consignado. Sozinho, ele não abre a porta 3.' },
  { fala: 'A financeira tira a parcela da minha conta todo mês.', certa: 'pessoal', porque: 'Cobrado pela financeira na conta, fora do INSS: é o empréstimo pessoal, o que a porta 3 procura. Agora confirme se é numa das 5.' },
  { fala: 'Tenho um empréstimo no BMG.', certa: 'pergunte', porque: 'O BMG também trabalha com consignado e com cartão consignado. O nome do banco não basta: pergunte se é descontado pelo INSS ou cobrado pela financeira.' },
  { fala: 'Eu pago um carnê da financeira todo mês.', certa: 'pessoal', porque: 'Carnê pago direto à financeira não passa pelo INSS: tem cara de empréstimo pessoal. Confirme que é empréstimo e se é numa das 5.' },
  { fala: 'Tenho cartão consignado, que vem descontado no benefício.', certa: 'consignado', porque: 'Cartão consignado também é descontado pelo INSS e usa a margem. É consignado, não empréstimo pessoal.' },
  { fala: 'Tenho empréstimo, mas não sei de que tipo é.', certa: 'pergunte', porque: 'Explique numa frase: "é aquele que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício". Uma vez só; seguiu sem saber, siga em frente.' },
];

/** Treino de ouvido: o que o cliente disse é consignado, empréstimo pessoal ou ainda não dá para saber? */
export function PessoalOuConsignado() {
  const [resp, setResp] = useState<(Tipo | null)[]>(() => FRASES_TIPO.map(() => null));
  const feitas = resp.filter((r) => r !== null).length;
  const acertos = FRASES_TIPO.filter((f, k) => resp[k] === f.certa).length;
  return (
    <div className="vidro mv-cli-tp">
      <div className="mv-cli-tp-topo">
        <b>Pessoal ou consignado?</b>
        <span className="num">{feitas === 0 ? `${FRASES_TIPO.length} falas de cliente` : `${acertos} de ${feitas} certas`}</span>
        {feitas > 0 && <button type="button" className="mv-link" onClick={() => setResp(FRASES_TIPO.map(() => null))}>Recomeçar</button>}
      </div>
      <ol className="mv-cli-tp-lista">
        {FRASES_TIPO.map((f, k) => {
          const r = resp[k];
          return (
            <li key={f.fala} className="mv-cli-tp-it" data-estado={r === null ? undefined : r === f.certa ? 'certo' : 'errado'}>
              <p className="mv-cli-tp-fala">"{f.fala}"</p>
              {r === null ? (
                <div className="mv-cli-tp-bts" role="group" aria-label="Que tipo de empréstimo é?">
                  {(['consignado', 'pessoal', 'pergunte'] as Tipo[]).map((t) => (
                    <button key={t} type="button" className="mv-cli-btn" onClick={() => setResp((a) => a.map((x, j) => (j === k ? t : x)))}>{TIPO_ROT[t]}</button>
                  ))}
                </div>
              ) : (
                <div className="mv-cli-tp-r" role="status">
                  <b>{r === f.certa ? <><IcCheck />{TIPO_ROT[f.certa]}</> : <><IcX />Era: {TIPO_ROT[f.certa]}</>}</b>
                  <span>{f.porque}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ===================================================================== tradutor de jargão */
const JARGAO: { de: string; para: string; nota: string }[] = [
  { de: 'Margem consignável', para: 'O quanto ainda pode ser descontado do seu benefício, pelo INSS, para pagar empréstimo.', nota: 'O cliente não pensa em "margem": ele pensa no desconto que vem todo mês.' },
  { de: 'Consignado', para: 'O empréstimo que o INSS desconta direto do seu benefício, todo mês.', nota: 'Muitos nem sabem que o empréstimo deles tem esse nome. Fale do desconto. Lembre: não é ele que abre a porta 3.' },
  { de: 'Empréstimo pessoal', para: 'O empréstimo que a financeira cobra na sua conta, e não o que o INSS desconta do benefício.', nota: 'É o que a porta 3 pergunta e o que o processo revisa. O cliente costuma chamar os dois só de "empréstimo": use esta frase para separar.' },
  { de: 'Portabilidade', para: 'Levar o empréstimo que o INSS desconta do seu benefício para outro banco.', nota: 'Aqui, portabilidade é a dos consignados, o gancho do canal de empréstimo. Uma frase basta; os detalhes vêm depois, se ele quiser saber.' },
  { de: 'Ressarcimento', para: 'Pedir de volta o que foi descontado nos últimos 10 anos no seu empréstimo pessoal. O resultado depende da análise.', nota: 'Fale sempre em "pedir de volta", nunca em "vai receber": não se promete resultado.' },
  { de: 'Honorários', para: 'A parte do advogado: 30% do valor que o senhor ganhar no processo, só no final, retirados desse valor.', nota: 'Diga junto que nada é pago para começar. É a dúvida que mais pesa.' },
  { de: 'Carta de concessão', para: 'O documento do INSS que mostra qual benefício o senhor recebe e desde quando.', nota: 'Ajuda a confirmar a porta 1 quando o cliente não sabe dizer o tipo do benefício.' },
  { de: 'Elegível', para: 'O senhor pode fazer a análise.', nota: '"Elegível" é palavra nossa, de dentro. Para o cliente, diga o resultado.' },
  { de: 'Titular', para: 'A pessoa que recebe o benefício.', nota: 'Na rota do familiar, deixe claro: "os documentos vão ser da sua mãe, que é quem recebe".' },
];
const IcSetaDir = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12h15M13 6l6 6-6 6" /></svg>
);
/** Clique numa palavra técnica e veja como dizer a mesma coisa para o cliente. */
export function TradutorJargao() {
  const [sel, setSel] = useState(0);
  const j = JARGAO[sel];
  return (
    <div className="vidro mv-cli-trad">
      <div className="mv-cli-trad-chips" role="group" aria-label="Escolha uma palavra técnica">
        {JARGAO.map((x, i) => (
          <button key={x.de} type="button" className="mv-cli-trad-chip" aria-pressed={sel === i} onClick={() => setSel(i)}>{x.de}</button>
        ))}
      </div>
      <div className="mv-cli-trad-par" aria-live="polite">
        <div className="mv-cli-trad-lado" data-tom="ruim"><small>Em vez de</small><b>"{j.de}"</b></div>
        <span className="mv-cli-trad-seta"><IcSetaDir /></span>
        <div className="mv-cli-trad-lado" data-tom="bom"><small>Diga assim</small><b>"{j.para}"</b></div>
      </div>
      <p className="mv-cli-trad-nota">{j.nota}</p>
    </div>
  );
}

/* ===================================================================== treino: atende ou descarta? */
type Resposta = 'atende' | 'familiar' | 'descarta';
const ROTULO: Record<Resposta, string> = { atende: 'Atende', familiar: 'Atende pelo familiar', descarta: 'Não elegível' };
type Caso = { nome: string; idade: string; fala: string; fichas: [string, string][]; certa: Resposta; tambem?: Resposta; porta: string; porque: string };

const CASOS: Caso[] = [
  {
    nome: 'Dona Cida', idade: '70 anos', fala: 'Sou aposentada por idade e tenho um empréstimo pessoal no Agibank faz tempo.',
    fichas: [['Benefício', 'Aposentadoria do INSS'], ['Empréstimo pessoal', 'Agibank']],
    certa: 'atende', porta: 'Portas 1 e 3 abertas',
    porque: 'Benefício próprio do INSS e empréstimo pessoal numa das 5 financeiras (e uma das top 3). É o cliente que o anúncio procura.',
  },
  {
    nome: 'Dona Odete', idade: '71 anos', fala: 'Sou aposentada. Tenho dois consignados, um do BMG e um do Agibank, que o INSS já desconta do benefício. Empréstimo com a financeira, fora isso, não tenho.',
    fichas: [['Benefício', 'Aposentadoria do INSS'], ['Consignados', 'BMG e Agibank (descontados pelo INSS)'], ['Empréstimo pessoal', 'Nenhum']],
    certa: 'descarta', porta: 'Porta 1 aberta, porta 3 fechada',
    porque: 'BMG e Agibank estão entre as 5, mas o que ela tem é consignado, descontado pelo INSS. A porta 3 pede empréstimo pessoal, e ela não tem nenhum. Agradeça e encerre com carinho.',
  },
  {
    nome: 'Márcio', idade: '44 anos', fala: 'Sou CLT e queria revisar os juros de um empréstimo que eu tenho.',
    fichas: [['Benefício', 'Nenhum do INSS'], ['Família', 'Você perguntou: ninguém recebe do INSS']],
    certa: 'descarta', porta: 'Portas 1 e 2 fechadas',
    porque: 'Sem benefício do INSS, nem dele nem de um familiar, as portas 1 e 2 ficam fechadas, e nem chega a porta 3. Agradeça e encerre com carinho.',
  },
  {
    nome: 'Seu Valdir', idade: '66 anos', fala: 'Aposentado eu não sou, não. Recebo o LOAS. E tenho um empréstimo pessoal no BMG.',
    fichas: [['Benefício', 'BPC/LOAS'], ['Empréstimo pessoal', 'BMG']],
    certa: 'atende', porta: 'Portas 1 e 3 abertas',
    porque: 'BPC/LOAS é pago pelo INSS: qualquer benefício do INSS abre a porta 1. "Não sou aposentado" não quer dizer "não tenho benefício".',
  },
  {
    nome: 'Seu Antônio', idade: '72 anos', fala: 'Sou aposentado. Tenho consignado em outro banco e, além dele, um empréstimo pessoal na Crefisa.',
    fichas: [['Benefício', 'Aposentadoria do INSS'], ['Consignado', 'Em outro banco'], ['Empréstimo pessoal', 'Crefisa']],
    certa: 'atende', porta: 'Portas 1 e 3 abertas',
    porque: 'O consignado em outro banco não muda nada. A porta 3 pede empréstimo pessoal numa das 5, e a Crefisa está na lista: segue para a análise.',
  },
  {
    nome: 'Patrícia', idade: '39 anos', fala: 'Eu trabalho de carteira assinada. Quem tem empréstimo pessoal é a minha mãe, que é pensionista. É no Mercantil.',
    fichas: [['Ela', 'CLT, sem benefício do INSS'], ['Mãe', 'Pensionista do INSS'], ['Empréstimo pessoal (da mãe)', 'Mercantil']],
    certa: 'familiar', porta: 'Porta 2 e porta 3 abertas',
    porque: 'Ela não recebe, mas a mãe recebe do INSS e tem empréstimo pessoal numa das 5. A análise segue pelo benefício da mãe, e os documentos passam a ser dela.',
  },
  {
    nome: 'Dona Neusa', idade: '63 anos', fala: 'Recebo a pensão do meu falecido marido. O empréstimo pessoal que eu tenho é de outro banco, não é nenhum desses que você falou.',
    fichas: [['Benefício', 'Pensão por morte (INSS)'], ['Empréstimo pessoal', 'Só em outro banco, fora das 5']],
    certa: 'descarta', porta: 'Porta 1 aberta, porta 3 fechada',
    porque: 'Ela passa pela porta 1, mas não pela 3: não tem empréstimo pessoal em nenhuma das 5 financeiras. Só trabalhamos com essas.',
  },
  {
    nome: 'Seu Osvaldo', idade: '74 anos', fala: 'Sou aposentado. O banco eu não lembro, foi a minha filha que fez pra mim. (Você perguntou de novo, citando as 5 e explicando o que é o empréstimo pessoal.) Não sei te dizer, não.',
    fichas: [['Benefício', 'Aposentadoria do INSS'], ['Empréstimo pessoal', 'Não sabe, mesmo depois da segunda pergunta']],
    certa: 'atende', porta: 'Porta 1 aberta, porta 3 a confirmar',
    porque: 'Você já repetiu a pergunta uma vez. Seguiu sem saber? Siga em frente, sem travar a conversa. A porta 3 continua valendo se depois ficar claro que não há empréstimo pessoal nas 5.',
  },
  {
    nome: 'Seu Jorge', idade: '67 anos', fala: 'Sou professor aposentado do Estado. Do INSS não recebo nada, e ninguém da minha família recebe.',
    fichas: [['Benefício', 'Aposentadoria do regime próprio do Estado'], ['Família', 'Ninguém recebe do INSS']],
    certa: 'descarta', porta: 'Portas 1 e 2 fechadas',
    porque: 'Ele é aposentado, mas não pelo INSS: quem paga é o regime próprio do Estado. Sem benefício do INSS na família, não é elegível.',
  },
  {
    nome: 'Dona Iracema', idade: '58 anos', fala: 'Estou encostada pelo INSS, recebendo auxílio. Fiz um empréstimo pessoal na Facta.',
    fichas: [['Benefício', 'Auxílio do INSS'], ['Empréstimo pessoal', 'Facta']],
    certa: 'atende', porta: 'Portas 1 e 3 abertas',
    porque: 'Auxílio também é benefício do INSS, e a Facta está entre as 5. Não descarte só porque ela não é aposentada.',
  },
  {
    nome: 'Cláudio', idade: '52 anos', fala: 'Sou servidor da prefeitura, não tenho nada do INSS. Mas o meu pai é aposentado do INSS e tem empréstimo pessoal no Mercantil.',
    fichas: [['Ele', 'Servidor, sem benefício do INSS'], ['Pai', 'Aposentado do INSS'], ['Empréstimo pessoal (do pai)', 'Mercantil']],
    certa: 'familiar', porta: 'Porta 2 e porta 3 abertas',
    porque: 'Rota do familiar: a análise segue pelo benefício do pai, que tem empréstimo pessoal no Mercantil, uma das top 3. Os documentos passam a ser do pai.',
  },
  {
    nome: 'Dona Lurdes', idade: '60 anos', fala: 'Eu recebo pensão do meu ex-marido, ele deposita todo mês. Do INSS não tenho nada, e lá em casa ninguém recebe.',
    fichas: [['"Pensão"', 'Pensão alimentícia, paga pelo ex-marido'], ['Família', 'Ninguém recebe do INSS']],
    certa: 'descarta', porta: 'Portas 1 e 2 fechadas',
    porque: 'Nem toda "pensão" é do INSS. Pensão alimentícia é paga pela pessoa, não pelo INSS. Sem benefício do INSS na família, não é elegível.',
  },
  {
    nome: 'Dona Terezinha', idade: '81 anos', fala: 'Oi, aqui é a neta dela. A vó é aposentada e tem empréstimo pessoal no Mercantil e no BMG. Eu tô ajudando ela no celular.',
    fichas: [['Quem recebe', 'A avó, aposentada do INSS'], ['Empréstimo pessoal', 'Mercantil e BMG (da avó)'], ['Quem digita', 'A neta']],
    certa: 'atende', tambem: 'familiar', porta: 'Portas 1 e 3 abertas (da avó)',
    porque: 'A cliente é a avó: o benefício e os empréstimos são dela, e os documentos também. A neta só ajuda com o celular. "Atende" ou "pelo familiar" levam ao mesmo lugar.',
  },
  {
    nome: 'Rosana', idade: '47 anos', fala: 'Vi o anúncio do empréstimo. Sou pensionista do INSS. Me disseram que estou sem margem para consignado, aí fiz um empréstimo pessoal no Agibank.',
    fichas: [['Benefício', 'Pensão do INSS'], ['Margem', 'Sem margem para consignado'], ['Empréstimo pessoal', 'Agibank']],
    certa: 'atende', porta: 'Portas 1 e 3 abertas',
    porque: 'Margem não é porta. Ela tem benefício do INSS e empréstimo pessoal numa das 5: pode seguir para a análise. É comum: sem margem para consignado, muita gente recorre ao empréstimo pessoal, que é mais caro.',
  },
];

/** Quantos casos o treino tem (o texto da lição usa este número). */
export const TOTAL_CASOS = CASOS.length;

const acertou = (c: Caso, r: Resposta) => r === c.certa || r === c.tambem;

/** Treino com os casos, um por vez, com explicação e placar no final. */
export function TriagemCasos() {
  const [resp, setResp] = useState<(Resposta | null)[]>(() => CASOS.map(() => null));
  const [i, setI] = useState(0);
  const fim = i >= CASOS.length;
  const acertos = CASOS.filter((c, k) => resp[k] !== null && acertou(c, resp[k] as Resposta)).length;

  function responder(r: Resposta) { setResp((a) => a.map((x, k) => (k === i ? r : x))); }
  function reiniciar() { setResp(CASOS.map(() => null)); setI(0); }

  const c = fim ? null : CASOS[i];
  const r = fim ? null : resp[i];

  return (
    <div className="mv-cli-jogo">
      <div className="vidro mv-cli-jogo-topo">
        <span className="num">{fim ? 'Fim do treino' : `Caso ${i + 1} de ${CASOS.length}`}</span>
        <div className="mv-cli-pontos" aria-hidden>
          {CASOS.map((cc, k) => (
            <i key={cc.nome} data-estado={k === i ? 'atual' : resp[k] === null ? undefined : acertou(cc, resp[k] as Resposta) ? 'certo' : 'errado'} />
          ))}
        </div>
        <span className="num">{acertos} acerto{acertos === 1 ? '' : 's'}</span>
      </div>

      {c && (
        <div className="vidro mv-cli-caso">
          <div className="mv-cli-caso-cab">
            <span className="mv-cli-caso-av" aria-hidden>{c.nome.replace(/^(Dona|Seu) /, '').slice(0, 1)}</span>
            <div><b>{c.nome}</b><small>{c.idade} · caso fictício</small></div>
          </div>
          <p className="mv-cli-caso-fala">"{c.fala}"</p>
          <dl className="mv-cli-caso-fichas">
            {c.fichas.map(([rot, val]) => <div key={rot}><dt>{rot}</dt><dd>{val}</dd></div>)}
          </dl>
          {r === null ? (
            <div className="mv-cli-caso-bts" role="group" aria-label="Qual é a sua decisão?">
              <button type="button" className="mv-cli-btn" data-tom="verde" onClick={() => responder('atende')}><IcCheck />Atende</button>
              <button type="button" className="mv-cli-btn" onClick={() => responder('familiar')}><IcCheck />Atende pelo familiar</button>
              <button type="button" className="mv-cli-btn" data-tom="rubro" onClick={() => responder('descarta')}><IcX />Não elegível</button>
            </div>
          ) : (
            <div className="mv-cli-caso-r" data-ok={acertou(c, r) ? '' : undefined} role="status">
              <b>{acertou(c, r) ? 'Acertou.' : `Não foi dessa vez. Resposta certa: ${ROTULO[c.certa]}.`}</b>
              <span className="mv-cli-caso-porta">{c.porta}</span>
              <p>{c.porque}</p>
              <button type="button" className="mv-cli-btn" data-cheio="" onClick={() => setI(i + 1)}>
                {i === CASOS.length - 1 ? 'Ver o resultado' : 'Próximo caso'}
              </button>
            </div>
          )}
        </div>
      )}

      {fim && (
        <div className="vidro mv-cli-jogo-fim" role="status">
          <div>
            <b className="num">{acertos} de {CASOS.length}</b>
            <span>{acertos === CASOS.length ? 'Perfeito: você domina as 3 portas.' : acertos >= CASOS.length - 3 ? 'Muito bom. Revise os casos abaixo.' : 'Vale reler as 3 portas e a árvore e jogar de novo.'}</span>
          </div>
          {acertos < CASOS.length && (
            <ul className="mv-cli-jogo-erros">
              {CASOS.map((cc, k) => (resp[k] !== null && !acertou(cc, resp[k] as Resposta) ? (
                <li key={cc.nome}><b>{cc.nome}: {ROTULO[cc.certa]}</b>{cc.porque}</li>
              ) : null))}
            </ul>
          )}
          <div><button type="button" className="mv-cli-btn" data-cheio="" onClick={reiniciar}>Jogar de novo</button></div>
        </div>
      )}
    </div>
  );
}
