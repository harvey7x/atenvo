/* Lição 9 — ilustrações próprias (prefixo mv-fu-): trilha das travas,
   pensamentos do cliente, termômetro do lead (com exercício de classificar),
   árvore "insistir ou parar", cadência sugerida, anatomia da retomada, mapa
   situação × mensagem (com copiar), roteiro de áudio, triângulo da família,
   ficha do combinado e faixa de horários. Só tokens do v2: claro e escuro.
   Fatos da empresa só do brief; as mensagens do atendente são sugestões. */
import { useState } from 'react';
import { copiar, Figura, IcCheck, IcX } from '../pecas';

const IcCopiar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2" />
    <path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5" />
  </svg>
);

/* ===================================================================== trilha das travas */
type Estacao = { l1: string; l2: string; trava?: [string, string] };
const ESTACOES: Estacao[] = [
  { l1: 'Robô', l2: 'nome e CPF' },
  { l1: 'Qualificação', l2: 'você assume', trava: ['Some no meio', 'das perguntas'] },
  { l1: 'Explicação', l2: 'e decisão', trava: ['Adia a', 'decisão'] },
  { l1: 'Meu INSS', l2: '3 documentos', trava: ['Não consegue', 'entrar no app'] },
  { l1: 'gov.br e Receita', l2: 'IR e CPF' },
  { l1: 'Documentos', l2: 'pessoais', trava: ['Não mandou', 'os documentos'] },
  { l1: 'Procurações', l2: 'e assinatura', trava: ['Conta gov.br', 'no bronze'] },
];
export function TrilhaTravas() {
  const x0 = 56, passo = 108, yv = 150;
  return (
    <Figura legenda="O caminho do cliente na CAF. Os pontos em âmbar são onde a conversa pode parar; cada parada pede um tipo de retomada.">
      <div className="mv-fu-rolar">
        <svg className="mv-fu-svg" viewBox="0 0 760 214" role="img"
          aria-label="Trilha do cliente em sete etapas: robô, qualificação, explicação e decisão, Meu INSS, gov.br e Receita (imposto de renda e situação do CPF), documentos pessoais, procurações e assinatura. Pontos de parada: some no meio das perguntas, adia a decisão, não consegue entrar no aplicativo do Meu INSS, não manda os documentos, conta gov.br no nível bronze.">
          <line className="mv-fu-tr-via" x1={x0} y1={yv} x2={x0 + passo * 6} y2={yv} />
          {ESTACOES.map((e, i) => {
            const x = x0 + i * passo;
            return (
              <g key={e.l1}>
                {e.trava && (
                  <>
                    <rect className="mv-fu-tr-bal" x={x - 50} y={22} width={100} height={48} rx={10} />
                    <text className="mv-fu-tr-bt" x={x} y={42} textAnchor="middle">{e.trava[0]}</text>
                    <text className="mv-fu-tr-bt" x={x} y={59} textAnchor="middle">{e.trava[1]}</text>
                    <line className="mv-fu-tr-fio" x1={x} y1={70} x2={x} y2={yv - 14} />
                  </>
                )}
                <circle className="mv-fu-tr-est" data-trava={e.trava ? '' : undefined} cx={x} cy={yv} r={10} />
                <text className="mv-fu-tr-n" x={x} y={yv + 32} textAnchor="middle">{e.l1}</text>
                <text className="mv-fu-tr-s" x={x} y={yv + 49} textAnchor="middle">{e.l2}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mv-fu-leg" aria-hidden>
        <span><i data-c="azul" />Etapa do processo</span>
        <span><i data-c="ambar" />Ponto onde a conversa pode parar</span>
      </div>
    </Figura>
  );
}

/* ===================================================================== pensamentos do cliente */
const PENSAMENTOS = [
  { pensa: 'Depois eu respondo…', motivo: 'Esqueceu ou se distraiu', ajuda: 'Um lembrete leve, sem cobrança, com a próxima pergunta já pronta.', tom: 'azul' },
  { pensa: 'Não entendi essa parte.', motivo: 'Ficou uma dúvida que ele não perguntou', ajuda: 'Explicar de outro jeito, mais simples. Um áudio curto costuma ajudar.', tom: 'azul' },
  { pensa: 'Será que isso é golpe?', motivo: 'Desconfiança', ajuda: 'Transparência: nada é pago antes, quem cuida é o advogado, Dr. Rafael Menezes, e a assinatura é pelo gov.br. Convide alguém da família.', tom: 'ambar' },
  { pensa: 'Não consigo mexer nisso.', motivo: 'Travou num aplicativo (Meu INSS, gov.br)', ajuda: 'Passo a passo bem devagar, um passo por mensagem, ou a ajuda de um familiar.', tom: 'ambar' },
  { pensa: 'Vou ver com meu filho.', motivo: 'Decide em família', ajuda: 'Um resumo por escrito para mostrar à família e o convite para o familiar conversar com você.', tom: 'ambar' },
  { pensa: 'Não quero mais.', motivo: 'Desistiu ou não tem interesse', ajuda: 'Respeitar. Agradecer com carinho e encerrar, sem insistir.', tom: 'rubro' },
];
export function PensamentosCliente() {
  return (
    <Figura legenda="O mesmo silêncio pode ter motivos bem diferentes, e cada motivo pede uma resposta diferente.">
      <div className="mv-fu-pens">
        {PENSAMENTOS.map((p) => (
          <div key={p.pensa} className="mv-fu-pen" data-tom={p.tom}>
            <span className="mv-fu-pen-bal">{p.pensa}</span>
            <div className="mv-fu-pen-it"><small>Pode ser</small><b>{p.motivo}</b></div>
            <div className="mv-fu-pen-it"><small>O que ajuda</small><span>{p.ajuda}</span></div>
          </div>
        ))}
      </div>
    </Figura>
  );
}

/* ===================================================================== termômetro do lead */
export type Nivel = 'quente' | 'morno' | 'frio' | 'fim';
const NIVEIS: { n: Nivel; t: string; titulo: string; k: number; sinais: string[]; fazer: string; ritmo: string }[] = [
  {
    n: 'quente', t: 'Quente', titulo: 'Lead quente: está com você agora', k: 0.94,
    sinais: ['Respondeu hoje', 'Faz perguntas sobre o processo', 'Já mandou algum documento', 'Pediu ajuda com o aplicativo'],
    fazer: 'Responda rápido e conduza um passo de cada vez. Combine o próximo passo na hora, antes que ele esfrie.',
    ritmo: 'Conversa ativa. Isso ainda não é follow-up: é atendimento.',
  },
  {
    n: 'morno', t: 'Morno', titulo: 'Lead morno: quer, mas empacou', k: 0.62,
    sinais: ['Disse “vou pensar”', 'Vai falar com a família', 'Travou num passo e parou', 'Responde, mas demora'],
    fazer: 'Descubra a trava e tire do caminho: resumo, passo a passo, áudio, ajuda de um familiar. Combine uma data para retomar.',
    ritmo: 'Siga a cadência combinada com o gestor, respeitando o prazo que ele pedir.',
  },
  {
    n: 'frio', t: 'Frio', titulo: 'Lead frio: sumiu de vez', k: 0.3,
    sinais: ['Vários toques sem resposta', 'Visualiza e não responde há dias', 'Respostas curtas, tipo “depois eu vejo”'],
    fazer: 'Toques mais espaçados e sempre com algo útil (uma ajuda, um resumo). No fim, despedida com porta aberta.',
    ritmo: 'Últimos passos da cadência. Depois, silêncio.',
  },
  {
    n: 'fim', t: 'Encerrado', titulo: 'Fora do termômetro: a conversa acabou', k: 0.04,
    sinais: ['Disse NÃO', 'Não é elegível', 'Pediu para não receber mais mensagens'],
    fazer: 'Agradeça com carinho e não insista. Esse cliente não entra em follow-up.',
    ritmo: 'Nenhum toque. Se ele voltar por conta própria, atenda com a mesma alegria.',
  },
];
const MARCAS = [{ y: 60, t: 'Quente', n: 'quente' }, { y: 140, t: 'Morno', n: 'morno' }, { y: 214, t: 'Frio', n: 'frio' }];
export function TermometroLead() {
  const [n, setN] = useState<Nivel>('morno');
  const atual = NIVEIS.find((x) => x.n === n) ?? NIVEIS[0];
  return (
    <Figura tag="Interativo" legenda="Toque em cada temperatura para ver os sinais e o que fazer com o lead.">
      <div className="mv-fu-tm" data-n={n}>
        <svg className="mv-fu-svg" viewBox="0 0 180 320" role="img" aria-label={`Termômetro do lead marcando: ${atual.t}`}>
          <rect className="mv-fu-tm-tubo" x="52" y="14" width="36" height="262" rx="18" />
          <circle className="mv-fu-tm-tubo" cx="70" cy="274" r="34" />
          <rect className="mv-fu-tm-tampa" x="53.5" y="200" width="33" height="64" />
          <rect className="mv-fu-tm-liq" x="61" y="30" width="18" height="244" rx="9" style={{ transform: `scaleY(${atual.k})` }} />
          <circle className="mv-fu-tm-bulbo" cx="70" cy="274" r="25" />
          {MARCAS.map((m) => (
            <g key={m.t}>
              <line className="mv-fu-tm-marca" x1="94" y1={m.y} x2="104" y2={m.y} />
              <text className="mv-fu-tm-rot" data-ativo={n === m.n ? '' : undefined} x="110" y={m.y + 5}>{m.t}</text>
            </g>
          ))}
        </svg>
        <div className="mv-fu-tm-info">
          <div className="mv-fu-tm-bts" role="group" aria-label="Temperatura do lead">
            {NIVEIS.map((x) => (
              <button key={x.n} type="button" className="mv-fu-tm-bt" data-n={x.n} aria-pressed={n === x.n} onClick={() => setN(x.n)}>
                <i aria-hidden />{x.t}
              </button>
            ))}
          </div>
          <div className="mv-fu-tm-det" data-n={n} role="status">
            <b>{atual.titulo}</b>
            <div>
              <small>Sinais</small>
              <ul>{atual.sinais.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div><small>O que fazer</small><span>{atual.fazer}</span></div>
            <div><small>Ritmo</small><span>{atual.ritmo}</span></div>
          </div>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== exercício: classificar o lead */
const ROTULO: Record<Nivel, string> = { quente: 'Quente', morno: 'Morno', frio: 'Frio', fim: 'Encerrar' };
const CASOS_T: { quem: string; d: string; certo: Nivel; porque: string }[] = [
  { quem: 'Dona Teresa', d: 'Mandou o primeiro extrato do Meu INSS agora há pouco e perguntou como pega o próximo.', certo: 'quente', porque: 'Está participando agora. Responda rápido e siga para o próximo documento.' },
  { quem: 'Seu Carlos', d: 'Disse: “vou ver com a minha filha no fim de semana e te falo”.', certo: 'morno', porque: 'Tem interesse, mas vai decidir em família. Mande um resumo e combine a data.' },
  { quem: 'Dona Neusa', d: 'Sumiu faz tempo. Você já mandou três mensagens, em dias diferentes, todas visualizadas.', certo: 'frio', porque: 'Vários toques sem resposta. Espaçar, mandar algo útil e, no fim, despedida com porta aberta.' },
  { quem: 'Seu Valdir', d: 'Respondeu “NÃO” quando o robô perguntou se queria a análise gratuita.', certo: 'fim', porque: 'Disse NÃO. O robô já deixou a porta aberta. Você não insiste.' },
  { quem: 'Dona Lúcia', d: 'Tentou entrar no Meu INSS, disse que “deu erro na senha” e parou de responder ontem.', certo: 'morno', porque: 'Quer, mas travou no aplicativo. A retomada certa é ajuda com o passo a passo.' },
  { quem: 'Seu Jorge', d: 'É servidor público, não recebe benefício do INSS e ninguém da família recebe.', certo: 'fim', porque: 'Não é elegível. Agradeça com carinho e encerre, sem insistir.' },
];
const OPCOES: Nivel[] = ['quente', 'morno', 'frio', 'fim'];
export function ClassificarLead() {
  const [resp, setResp] = useState<Record<number, Nivel>>({});
  const feitos = Object.keys(resp).length;
  const acertos = CASOS_T.filter((c, i) => resp[i] === c.certo).length;
  return (
    <div className="mv-fu-cl">
      {CASOS_T.map((c, i) => {
        const r = resp[i];
        return (
          <div key={c.quem} className="vidro mv-fu-cl-caso" data-estado={r === undefined ? undefined : r === c.certo ? 'certo' : 'errado'}>
            <div className="mv-fu-cl-tx"><b>{c.quem}</b><span>{c.d}</span></div>
            {r === undefined ? (
              <div className="mv-fu-cl-bts" role="group" aria-label={`Classificar o caso de ${c.quem}`}>
                {OPCOES.map((o) => (
                  <button key={o} type="button" data-n={o} onClick={() => setResp((p) => ({ ...p, [i]: o }))}>
                    <i aria-hidden />{ROTULO[o]}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mv-fu-cl-r">
                <b>{r === c.certo ? 'Acertou.' : `Melhor: ${ROTULO[c.certo]}.`}</b> {c.porque}
              </p>
            )}
          </div>
        );
      })}
      {feitos === CASOS_T.length && (
        <div className="mv-fu-cl-fim" role="status">
          <b className="num">{acertos} de {CASOS_T.length}</b> acertos.
          <button type="button" className="mv-link" onClick={() => setResp({})}>Fazer de novo</button>
        </div>
      )}
    </div>
  );
}

/* ===================================================================== árvore: insistir ou parar */
const PERGUNTAS_ARV: { q: [string, string]; f: [string, string]; tom: string }[] = [
  { q: ['1. Ele disse NÃO, não é elegível', 'ou pediu para parar as mensagens?'], f: ['Agradeça com carinho', 'e encerre. Sem follow-up.'], tom: 'rubro' },
  { q: ['2. Ele pediu um prazo ou', 'marcou um dia para retomar?'], f: ['Anote e retome no dia', 'e na hora combinados.'], tom: 'azul' },
  { q: ['3. Ainda há toques na cadência', 'que você combinou com o gestor?'], f: ['Mande o próximo toque:', 'lembrete, ajuda e pergunta.'], tom: 'verde' },
];
export function ArvoreInsistir() {
  const passo = 110;
  return (
    <Figura legenda="Faça estas perguntas, nesta ordem, antes de cada retomada. A primeira resposta “sim” decide o que fazer.">
      <div className="mv-fu-rolar">
        <svg className="mv-fu-svg" viewBox="0 0 760 440" role="img"
          aria-label="Árvore de decisão. Pergunta 1: ele disse não, não é elegível ou pediu para parar? Se sim, agradeça e encerre. Se não, pergunta 2: pediu prazo ou marcou um dia? Se sim, retome no dia combinado. Se não, pergunta 3: ainda há toques na cadência combinada com o gestor? Se sim, mande o próximo toque. Se não, despedida com porta aberta e pare. Se ele responder em qualquer ponto, volta a ser conversa normal.">
          <defs>
            <marker id="mv-fu-seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className="mv-fu-av-ponta" d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>
          {PERGUNTAS_ARV.map((p, i) => {
            const y = 20 + i * passo;
            return (
              <g key={p.q[0]}>
                <rect className="mv-fu-av-q" x="20" y={y} width="400" height="70" rx="12" />
                <text className="mv-fu-av-qt" x="40" y={y + 30}>{p.q[0]}</text>
                <text className="mv-fu-av-qt" x="40" y={y + 50}>{p.q[1]}</text>
                <line className="mv-fu-av-seta" x1="420" y1={y + 35} x2="476" y2={y + 35} markerEnd="url(#mv-fu-seta)" />
                <text className="mv-fu-av-sn" x="448" y={y + 27} textAnchor="middle">Sim</text>
                <rect className="mv-fu-av-f" data-tom={p.tom} x="480" y={y} width="260" height="70" rx="12" />
                <text className="mv-fu-av-ft" x="500" y={y + 30}>{p.f[0]}</text>
                <text className="mv-fu-av-ft" x="500" y={y + 50}>{p.f[1]}</text>
                <line className="mv-fu-av-seta" x1="220" y1={y + 70} x2="220" y2={y + passo - 2} markerEnd="url(#mv-fu-seta)" />
                <text className="mv-fu-av-sn" x="232" y={y + 94}>Não</text>
              </g>
            );
          })}
          <rect className="mv-fu-av-f" data-tom="ambar" x="20" y="350" width="400" height="70" rx="12" />
          <text className="mv-fu-av-ft" x="40" y="380">Não há mais toques:</text>
          <text className="mv-fu-av-ft" x="40" y="400">despedida com porta aberta. E pare.</text>
          <rect className="mv-fu-av-nota" x="480" y="350" width="260" height="70" rx="12" />
          <text className="mv-fu-av-qt" x="500" y="380">Respondeu em qualquer ponto?</text>
          <text className="mv-fu-av-qt" x="500" y="400">Volta a ser conversa normal.</text>
        </svg>
      </div>
    </Figura>
  );
}

/* ===================================================================== cadência sugerida */
const TOQUES = [
  { n: 1, quando: 'Logo depois', sub: '', formato: 'Texto', obj: 'Lembrar com leveza', ex: 'No mesmo dia em que parou: “A nossa conversa parou ali, sem problema…”' },
  { n: 2, quando: 'No dia seguinte', sub: '', formato: 'Texto + ajuda', obj: 'Tirar a trava do caminho', ex: 'O passo a passo, só o próximo documento que falta ou a resposta à dúvida.' },
  { n: 3, quando: 'Alguns dias depois', sub: '', formato: 'Áudio curto', obj: 'Mostrar que tem gente de verdade', ex: 'Seu nome, onde pararam, a ajuda e uma pergunta. Uns 30 segundos.' },
  { n: 4, quando: 'Mais adiante', sub: '', formato: 'Resumo', obj: 'Relembrar o que é e o que falta', ex: 'Resumo curto do processo e do próximo passo. “Ainda faz sentido pra você?”' },
  { n: 5, quando: 'Último toque', sub: '', formato: 'Porta aberta', obj: 'Encerrar com carinho', ex: '“Não vou mais te incomodar. Quando quiser retomar, é só me chamar aqui.”' },
];
const XS_CAD = [70, 220, 370, 530, 680];
export function CadenciaSugerida() {
  return (
    <Figura tag="Sugestão" legenda="Ritmo sugerido, em marcos relativos (sem escala exata e sem número de dias). Não é regra da empresa: combine a cadência com o seu gestor.">
      <div className="mv-fu-cad">
        <span className="mv-fu-tag">Sugestão · combine a cadência com o seu gestor</span>
        <div className="mv-fu-rolar">
          <svg className="mv-fu-svg" viewBox="0 0 760 160" role="img"
            aria-label="Linha do tempo sugerida com cinco toques, nunca mais de um por dia: logo depois que a conversa parou, texto; no dia seguinte, texto com ajuda; alguns dias depois, áudio curto; mais adiante, resumo; no último toque, despedida com porta aberta. O interesse do cliente tende a esfriar com o tempo.">
            <rect className="mv-fu-cad-faixa" data-z="q" x="10" y="8" width="140" height="146" rx="10" />
            <rect className="mv-fu-cad-faixa" data-z="m" x="150" y="8" width="300" height="146" />
            <rect className="mv-fu-cad-faixa" data-z="f" x="450" y="8" width="300" height="146" rx="10" />
            <text className="mv-fu-cad-z" data-z="q" x="22" y="28">Quente</text>
            <text className="mv-fu-cad-z" data-z="m" x="162" y="28">Morno</text>
            <text className="mv-fu-cad-z" data-z="f" x="462" y="28">Frio</text>
            <line className="mv-fu-cad-linha" x1={XS_CAD[0]} y1="72" x2={XS_CAD[4]} y2="72" />
            {TOQUES.map((t, i) => (
              <g key={t.n}>
                <circle className="mv-fu-cad-ponto" cx={XS_CAD[i]} cy="72" r="16" />
                <text className="mv-fu-cad-num" x={XS_CAD[i]} y="77" textAnchor="middle">{t.n}</text>
                <text className="mv-fu-cad-q" x={XS_CAD[i]} y="116" textAnchor="middle">{t.quando}</text>
                <text className="mv-fu-cad-f" x={XS_CAD[i]} y="135" textAnchor="middle">{t.formato}</text>
              </g>
            ))}
          </svg>
        </div>
        <ol className="mv-fu-cad-cards">
          {TOQUES.map((t) => (
            <li key={t.n}>
              <span className="mv-fu-cad-cab"><span className="mv-fu-cad-n num">{t.n}</span><b>{t.quando}</b></span>
              {t.sub && <small className="mv-fu-cad-sub">{t.sub}</small>}
              <em className="mv-fu-cad-chip">{t.formato}</em>
              <span className="mv-fu-cad-obj"><small>Objetivo</small>{t.obj}</span>
              <span className="mv-fu-cad-ex">{t.ex}</span>
            </li>
          ))}
        </ol>
        <div className="mv-fu-cad-teto">
          <b>Nunca mais de um toque por dia.</b>
          <span>Conte os toques de todos: o seu, o de um colega e o automático. O número de toques e o intervalo entre eles, combine com o seu gestor.</span>
        </div>
        <div className="mv-fu-cad-regras">
          <div data-tom="verde"><b>Respondeu?</b><span>A cadência para. Volta a ser conversa.</span></div>
          <div data-tom="azul"><b>Pediu prazo?</b><span>Vale o prazo dele, não o da cadência.</span></div>
          <div data-tom="rubro"><b>Disse não?</b><span>Agradeça e encerre. Nenhum toque a mais.</span></div>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== anatomia da retomada */
const PARTES_RET = [
  { t: 'Oi, Seu Antônio! Aqui é [seu nome], da CAF.', n: 'Quem é você', d: 'Ele pode não lembrar de você nem do número. Nome + CAF reconectam a conversa e passam segurança.' },
  { t: 'Passando pra lembrar da sua análise: pra gente seguir, falta a documentação.', n: 'Onde vocês pararam', d: 'Um lembrete do contexto, sem culpa. Nada de “o senhor sumiu”.' },
  { t: 'Não precisa mandar tudo de uma vez. Pode começar só pelo próximo documento que falta, que eu te guio no resto.', n: 'Um passo pequeno + ajuda', d: 'Pedir tudo de uma vez assusta. Um passo fácil (o próximo documento, seja qual for), com a sua ajuda, faz a conversa andar.' },
  { t: 'Fica bom pra você?', n: 'Uma pergunta fácil', d: 'Dá para responder com um “sim”. Quem responde uma vez volta para a conversa.' },
];
const NUNCA = [
  'Cobrança ou culpa (“o senhor sumiu”, “por que não responde?”)',
  'Pressão ou urgência falsa (“última chance”, “só até hoje”)',
  'Promessa de valor ou de resultado',
  'Várias mensagens seguidas, sem esperar resposta',
];
export function AnatomiaRetomada() {
  return (
    <Figura legenda="As quatro partes de uma boa retomada, na ordem. Sugestão de roteiro: adapte ao cliente.">
      <div className="mv-fu-an">
        <div className="mv-fu-an-esq">
          <span className="mv-fu-an-quem">Você · retomada no dia seguinte</span>
          <p className="mv-fu-an-bolha">
            {PARTES_RET.map((p, i) => (
              <span key={p.n}>
                {i > 0 && ' '}
                <span className="mv-fu-an-tr" data-p={i}><sup>{i + 1}</sup>{p.t}</span>
              </span>
            ))}
          </p>
          <div className="mv-fu-an-nunca">
            <small>Nunca entra numa retomada</small>
            <ul>
              {NUNCA.map((t) => <li key={t}><span className="mv-fu-an-x"><IcX /></span>{t}</li>)}
            </ul>
          </div>
        </div>
        <ol className="mv-fu-an-leg" aria-label="As quatro partes da retomada">
          {PARTES_RET.map((p, i) => (
            <li key={p.n} data-p={i}>
              <span className="mv-fu-an-n num">{i + 1}</span>
              <span><b>{p.n}</b><small>{p.d}</small></span>
            </li>
          ))}
        </ol>
      </div>
    </Figura>
  );
}

/* ===================================================================== mapa: situação × mensagem */
type Situacao = {
  id: string; titulo: string; temp: Nivel; formato: string;
  sinal: string; porTras: string; objetivo: string; msg: string; seNao: string;
};
const SITUACOES: Situacao[] = [
  {
    id: 'qualif', titulo: 'Sumiu na qualificação', temp: 'morno', formato: 'Texto curto',
    sinal: 'Parou no meio das perguntas (benefício, empréstimo pessoal).',
    porTras: 'Distração, desconfiança com tanta pergunta, ou não sabe a resposta (o nome da financeira, ou se o empréstimo é pessoal ou consignado).',
    objetivo: 'Voltar com UMA pergunta fácil de responder.',
    msg: 'Oi, Dona Maria! Aqui é [seu nome], da CAF. A nossa conversa parou ali no meio, sem problema nenhum. Pra eu seguir com a sua análise gratuita, só preciso de uma resposta: a senhora recebe algum benefício do INSS?',
    seNao: 'No próximo toque, um áudio curto se apresentando. Se a dúvida for sobre o empréstimo, pergunte uma vez se tem empréstimo pessoal com Agibank, BMG, Facta, Mercantil ou Crefisa, explicando de um jeito simples: “é aquele que a financeira cobra na sua conta, e não o que o INSS desconta direto do benefício”. Se continuar sem saber, siga em frente.',
  },
  {
    id: 'topou', titulo: 'Topou, mas não mandou os documentos', temp: 'morno', formato: 'Texto + um passo',
    sinal: 'Disse “sim”, recebeu a lista de documentos e parou.',
    porTras: 'Achou a lista grande, não tem o comprovante à mão, não sabe tirar uma foto boa ou ficou sem tempo.',
    objetivo: 'Pedir só o próximo documento que falta, com a sua ajuda para o resto. A ordem não é rígida: vale o que ele tiver à mão.',
    msg: 'Oi, Seu Antônio! Aqui é [seu nome], da CAF. Passando pra lembrar da sua análise: pra gente seguir, falta a documentação. Não precisa mandar tudo de uma vez. Pode começar só pelo próximo documento que falta, que eu te guio no resto. Fica bom pra você?',
    seNao: 'Pergunte qual documento está mais difícil. Comprovante no nome de outra pessoa: dá para usar com o documento com foto dessa pessoa e uma declaração de residência. Sem e-mail: a gente cria um.',
  },
  {
    id: 'meuinss', titulo: 'Travou no Meu INSS', temp: 'morno', formato: 'Áudio + passos por texto',
    sinal: 'Disse que “deu erro”, que não acha o documento ou simplesmente parou nessa etapa.',
    porTras: 'Não lembra a senha do gov.br, não acha o documento no aplicativo ou tem vergonha de dizer que não sabe.',
    objetivo: 'Guiar devagar, um passo de cada vez, e descobrir onde exatamente ele parou.',
    msg: 'Oi, Dona Lúcia! O aplicativo do Meu INSS confunde mesmo, fica tranquila. Vamos devagar, um passo de cada vez:\n1. Abra o aplicativo Meu INSS\n2. Entre com a sua senha do gov.br\n3. Toque na busca “Do que você precisa?”\n4. Digite: extrato de empréstimo\nMe conta em qual desses passos parou, que eu te ajudo dali.',
    seNao: 'Ofereça a ajuda de um filho ou neto (com a permissão do cliente). Se o próprio cliente preferir que a CAF busque os documentos, siga o que a lição 10 (Meu INSS) ensina.',
  },
  {
    id: 'govbr', titulo: 'Travou na assinatura (gov.br)', temp: 'morno', formato: 'Texto + passo a passo',
    sinal: 'Recebeu as procurações, mas a assinatura não foi.',
    porTras: 'A conta gov.br está no nível bronze, ele não entendeu o pedido de assinatura ou travou na validação.',
    objetivo: 'Explicar o nível da conta e oferecer o passo a passo para subir para prata ou ouro.',
    msg: 'Oi, Dona Cida! Aqui é [seu nome], da CAF. Se a assinatura das procurações não foi, fica tranquila: isso costuma acontecer quando a conta do gov.br está no nível bronze. Pra assinar, ela precisa estar prata ou ouro, e dá pra subir no próprio aplicativo gov.br: validando com a conta do seu banco (prata) ou fazendo o reconhecimento facial (ouro). Quer que eu te mande o passo a passo?',
    seNao: 'Ofereça fazer junto, por áudio, ou com um familiar do lado. O passo a passo para subir de nível está na lição 13. Depois que o nível está certo, a assinatura é rápida.',
  },
  {
    id: 'familia', titulo: 'Vai falar com a família', temp: 'morno', formato: 'Texto + resumo escrito',
    sinal: '“Vou falar com meu filho”, “minha filha que vê essas coisas pra mim”.',
    porTras: 'Ele confia no filho para assuntos de dinheiro e de celular. Às vezes é também uma desconfiança educada.',
    objetivo: 'Dar à família o que ela precisa para decidir e combinar quando retomar.',
    msg: 'Claro, Seu Antônio, conversar com a família é sempre bom. Vou te mandar um resumo curtinho pra mostrar pro seu filho. E se ele quiser, pode me chamar aqui, que eu explico tudo pra ele também. Posso te chamar na quinta pra saber o que vocês decidiram?',
    seNao: 'No dia combinado, pergunte se o filho viu o resumo e se ficou alguma dúvida. Ofereça conversar direto com ele, sempre com a permissão do cliente.',
  },
  {
    id: 'pensar', titulo: 'Disse “vou pensar”', temp: 'morno', formato: 'Texto (e depois áudio)',
    sinal: '“Vou pensar”, “depois te falo”, sem data.',
    porTras: 'Costuma existir uma dúvida que não foi dita: medo de ter que pagar alguma coisa, medo de golpe ou de mexer no benefício.',
    objetivo: 'Descobrir a dúvida escondida e combinar uma data.',
    msg: 'Claro, Dona Helena, é uma decisão sua e é bom pensar com calma. Pra ajudar a senhora a pensar: ficou alguma dúvida? Sobre o custo, o prazo ou a segurança dos documentos? Às vezes uma pergunta resolve. Posso chamar a senhora amanhã à tarde?',
    seNao: 'No toque seguinte, responda às dúvidas mais comuns num áudio curto: nada é pago antes; os 30% saem só do que ela receber, no final; quem cuida é o advogado.',
  },
  {
    id: 'margem', titulo: 'Esfriou ao saber que não tem margem', temp: 'frio', formato: 'Texto + áudio',
    sinal: 'Veio pelo anúncio de empréstimo, soube que não há margem para um consignado novo e parou de responder.',
    porTras: 'Esperava dinheiro rápido. Achou que, sem margem, não havia mais nada para ele.',
    objetivo: 'Mostrar, com honestidade, os caminhos que ainda existem, sempre como possibilidade.',
    msg: 'Oi, Seu Pedro! Aqui é [seu nome], da CAF. Sei que o senhor queria um valor rápido e que hoje não há margem para um consignado novo. Mas não quero deixar o senhor sem caminho: dá pra ver a possibilidade de aumentar a margem, de fazer a portabilidade dos consignados pra outro banco, que pode liberar um valor acima de R$ 1.500, e a revisão dos juros do empréstimo pessoal que o senhor já tem. Quer que eu explique como cada um funciona? Antes de prometer qualquer coisa, a gente precisa analisar o caso do senhor.',
    seNao: 'Explique num áudio curto, e depois por texto, a diferença entre os caminhos: margem e portabilidade são do consignado; a revisão é dos juros do empréstimo pessoal, cobrado pela financeira fora do INSS. Nunca garanta que a portabilidade ou um empréstimo vai sair.',
  },
];
export function MapaSituacoes() {
  const [sel, setSel] = useState(0);
  const [copiou, setCopiou] = useState(false);
  const s = SITUACOES[sel];
  async function aoCopiar() {
    if (await copiar(s.msg)) { setCopiou(true); window.setTimeout(() => setCopiou(false), 1600); }
  }
  return (
    <Figura tag="Interativo" legenda="Escolha a situação para ver o diagnóstico, a mensagem sugerida e o que fazer se não vier resposta.">
      <div className="mv-fu-ms">
        <div className="mv-fu-ms-lista" role="tablist" aria-label="Situações de follow-up">
          {SITUACOES.map((x, i) => (
            <button key={x.id} type="button" role="tab" id={`mv-fu-ms-tab-${x.id}`} aria-selected={sel === i}
              aria-controls="mv-fu-ms-painel" className="mv-fu-ms-bt" onClick={() => { setSel(i); setCopiou(false); }}>
              <span className="mv-fu-ms-n num">{i + 1}</span>
              <span>{x.titulo}</span>
            </button>
          ))}
        </div>
        <div className="mv-fu-ms-painel" id="mv-fu-ms-painel" role="tabpanel" aria-labelledby={`mv-fu-ms-tab-${s.id}`}>
          <div className="mv-fu-ms-cab">
            <b>{s.titulo}</b>
            <span className="mv-fu-ms-chips">
              <span className="mv-fu-ms-chip" data-n={s.temp}><i aria-hidden />Lead {ROTULO[s.temp].toLowerCase()}</span>
              <span className="mv-fu-ms-chip">{s.formato}</span>
            </span>
          </div>
          <div className="mv-fu-ms-grade">
            <div><small>Como você percebe</small><span>{s.sinal}</span></div>
            <div><small>O que costuma estar por trás</small><span>{s.porTras}</span></div>
            <div><small>Objetivo da retomada</small><span>{s.objetivo}</span></div>
          </div>
          <div className="mv-fu-ms-msg">
            <small>Sugestão de roteiro · adapte ao cliente</small>
            <p>{s.msg}</p>
            <button type="button" className="mv-fu-cp" onClick={aoCopiar}>
              {copiou ? <><IcCheck />Copiado</> : <><IcCopiar />Copiar mensagem</>}
            </button>
          </div>
          <div className="mv-fu-ms-se"><small>Se não vier resposta</small><span>{s.seNao}</span></div>
        </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== roteiro de áudio */
const SEGS = [
  { de: 0, ate: 5, t: 'Quem é você', fala: 'Oi, Dona Lúcia, aqui é [seu nome], da CAF. Tudo bem com a senhora?' },
  { de: 5, ate: 15, t: 'Onde vocês pararam', fala: 'Ontem a senhora estava tentando entrar no Meu INSS e a gente parou ali.' },
  { de: 15, ate: 25, t: 'A ajuda', fala: 'Não tem problema nenhum, esse aplicativo confunde mesmo. Vou mandar agora, por escrito, o caminho passo a passo, e a senhora vai fazendo comigo.' },
  { de: 25, ate: 30, t: 'A pergunta', fala: 'Me conta: a senhora lembra a sua senha do gov.br?' },
];
const AU_X0 = 30, AU_LARG = 700, AU_BARRAS = 88;
const pxAudio = (seg: number) => AU_X0 + (seg / 30) * AU_LARG;
const BARRAS_AUDIO = Array.from({ length: AU_BARRAS }, (_, i) => {
  const t = ((i + 0.5) / AU_BARRAS) * 30;
  const seg = Math.max(0, SEGS.findIndex((s) => t >= s.de && t < s.ate));
  const h = 8 + Math.round(Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37)) * 46);
  return { x: AU_X0 + (i * AU_LARG) / AU_BARRAS, h, seg };
});
export function RoteiroAudio() {
  return (
    <Figura tag="Sugestão" legenda="Um áudio de retomada de uns 30 segundos, dividido em quatro partes. Sugestão de roteiro: fale do seu jeito.">
      <div className="mv-fu-au">
        <div className="mv-fu-rolar">
          <svg className="mv-fu-svg" viewBox="0 0 760 162" role="img"
            aria-label="Onda de um áudio de cerca de 30 segundos dividida em quatro partes: quem é você, até 5 segundos; onde vocês pararam, até 15 segundos; a ajuda, até 25 segundos; a pergunta, até 30 segundos.">
            {SEGS.map((s, i) => (
              <rect key={s.t} className="mv-fu-au-fundo" data-s={i} x={pxAudio(s.de) + 1} y="10" width={pxAudio(s.ate) - pxAudio(s.de) - 2} height="94" rx="8" />
            ))}
            {BARRAS_AUDIO.map((b, i) => (
              <rect key={i} className="mv-fu-au-barra" data-s={b.seg} x={b.x + 1.7} y={57 - b.h / 2} width="4.5" height={b.h} rx="2.2" />
            ))}
            {[0, 5, 15, 25, 30].map((t, i, arr) => (
              <text key={t} className="mv-fu-au-t" x={pxAudio(t)} y="122" textAnchor={i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}>{t} s</text>
            ))}
            {SEGS.map((s, i) => (
              <text key={s.t} className="mv-fu-au-rot" data-s={i} x={(pxAudio(s.de) + pxAudio(s.ate)) / 2} y="148" textAnchor="middle">{s.t}</text>
            ))}
          </svg>
        </div>
        <ol className="mv-fu-au-fala" aria-label="O que falar em cada parte">
          {SEGS.map((s, i) => (
            <li key={s.t} data-s={i}>
              <span className="mv-fu-au-n num">{i + 1}</span>
              <span><b>{s.t}</b><q>{s.fala}</q></span>
            </li>
          ))}
        </ol>
      </div>
    </Figura>
  );
}

/* ===================================================================== triângulo da família */
function Pessoa({ x, y }: { x: number; y: number }) {
  return (
    <g className="mv-fu-fa-pessoa">
      <circle cx={x} cy={y - 9} r="9" />
      <path d={`M${x - 15},${y + 17} a15,13 0 0 1 30,0 z`} />
    </g>
  );
}
export function TrianguloFamilia() {
  return (
    <Figura legenda="Quem decide é sempre o cliente. O familiar ajuda, com a permissão dele, e você conduz.">
      <div className="mv-fu-rolar">
        <svg className="mv-fu-svg" viewBox="0 0 760 330" role="img"
          aria-label="Triângulo com três pessoas. O cliente, no alto, decide e autoriza. Você, embaixo à esquerda, explica e conduz. O familiar, embaixo à direita, ajuda no celular. O cliente conversa e decide com você e dá a permissão ao familiar; você e o familiar trocam ajuda no aplicativo e nas dúvidas. No centro: só com a permissão do cliente.">
          <line className="mv-fu-fa-fio" x1="320" y1="110" x2="170" y2="220" />
          <line className="mv-fu-fa-fio" x1="440" y1="110" x2="590" y2="220" />
          <line className="mv-fu-fa-fio" data-tracejado="" x1="250" y1="268" x2="510" y2="268" />
          <text className="mv-fu-fa-rot" x="238" y="158" textAnchor="end">conversa e decide</text>
          <text className="mv-fu-fa-rot" x="522" y="158">dá a permissão</text>
          <text className="mv-fu-fa-rot" x="380" y="256" textAnchor="middle">ajuda no app e nas dúvidas</text>
          <rect className="mv-fu-fa-selo" x="290" y="172" width="180" height="48" rx="24" />
          <text className="mv-fu-fa-selot" x="380" y="192" textAnchor="middle">Só com a permissão</text>
          <text className="mv-fu-fa-selot" x="380" y="210" textAnchor="middle">do cliente</text>

          <rect className="mv-fu-fa-no" data-q="cliente" x="285" y="20" width="190" height="90" rx="14" />
          <Pessoa x={322} y={62} />
          <text className="mv-fu-fa-t" x="350" y="60">Cliente</text>
          <text className="mv-fu-fa-s" x="350" y="80">decide e autoriza</text>

          <rect className="mv-fu-fa-no" data-q="voce" x="40" y="220" width="210" height="90" rx="14" />
          <Pessoa x={78} y={262} />
          <text className="mv-fu-fa-t" x="106" y="260">Você</text>
          <text className="mv-fu-fa-s" x="106" y="280">explica e conduz</text>

          <rect className="mv-fu-fa-no" data-q="familiar" x="510" y="220" width="210" height="90" rx="14" />
          <Pessoa x={548} y={262} />
          <text className="mv-fu-fa-t" x="576" y="260">Familiar</text>
          <text className="mv-fu-fa-s" x="576" y="280">ajuda no celular</text>
        </svg>
      </div>
    </Figura>
  );
}

/* ===================================================================== ficha do combinado */
const FICHA: { k: string; v: string }[] = [
  { k: 'Cliente', v: 'Dona Lúcia (exemplo fictício)' },
  { k: 'Onde parou', v: 'Meu INSS. Não lembrava a senha do gov.br.' },
  { k: 'O que combinamos', v: 'O neto vai ajudar no sábado. Ela autorizou que ele fale comigo.' },
  { k: 'Próximo contato', v: 'Segunda, de manhã (horário que ela pediu).' },
  { k: 'Formato que funciona', v: 'Áudio curto + passos por texto. Ela prefere ouvir.' },
  { k: 'Toques já feitos', v: '2 (texto no mesmo dia; áudio e passo a passo no dia seguinte).' },
  { k: 'Cuidado', v: 'Não mandar nada antes de segunda.' },
];
export function FichaCombinado() {
  return (
    <Figura legenda="O que anotar depois de cada toque. Não é uma tela do sistema: registre onde a sua equipe registra (o gestor mostra).">
      <div className="mv-fu-ficha">
        <span className="mv-fu-ficha-pino" aria-hidden />
        <div className="mv-fu-ficha-cab"><b>Anotação de follow-up</b><small>exemplo</small></div>
        <dl>
          {FICHA.map((f) => (
            <div key={f.k} data-cuidado={f.k === 'Cuidado' ? '' : undefined}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Figura>
  );
}

/* ===================================================================== faixa de horários */
const PERIODOS_DIA: { t: string; st: 'evite' | 'cuidado' | 'bom' }[] = [
  { t: 'Madrugada', st: 'evite' },
  { t: 'Muito cedo', st: 'evite' },
  { t: 'Manhã', st: 'bom' },
  { t: 'Hora do almoço', st: 'cuidado' },
  { t: 'Tarde', st: 'bom' },
  { t: 'Começo da noite', st: 'cuidado' },
  { t: 'Tarde da noite', st: 'evite' },
];
const ST_TX = { evite: 'Evite', cuidado: 'Com cuidado', bom: 'Costuma ser tranquilo' } as const;
export function FaixaHorarios() {
  return (
    <Figura tag="Sugestão" legenda="Um dia do cliente, sem horário exato. Não é regra da empresa: os horários de envio da sua equipe, combine com o gestor.">
      <div className="mv-fu-fx">
        <ol className="mv-fu-fx-dia" aria-label="Períodos do dia">
          {PERIODOS_DIA.map((p) => (
            <li key={p.t} data-st={p.st}>
              <i aria-hidden />
              <b>{p.t}</b>
              <small>{ST_TX[p.st]}</small>
            </li>
          ))}
        </ol>
        <div className="mv-fu-fx-regra">
          <b>Acima de tudo:</b> se o cliente disse um horário (“só depois das cinco”, “de manhã meu neto está aqui”), vale o horário dele.
        </div>
      </div>
    </Figura>
  );
}
