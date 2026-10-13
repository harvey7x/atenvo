/* Lição 5 — ilustrações e interativos próprios (prefixo mv-cn-): o caminho do
   lead, os anúncios ilustrados, o ponto de partida de cada canal, o simulador
   das 3 portas, a ficha do que chega na mão, a régua da pré-aprovação, o fluxo
   por canal, a árvore do NÃO e o treino "de qual canal é esta mensagem?". */
import { useState, type ReactNode } from 'react';
import { IcCheck, IcX } from '../pecas';

/* ------------------------------------------------------------ anotações ao lado do celular */
export function Anotacoes({ itens }: { itens: { t: string; d: ReactNode }[] }) {
  return (
    <ol className="mv-cn-anot">
      {itens.map((it, i) => (
        <li key={it.t}>
          <span className="mv-cn-anot-n num">{i + 1}</span>
          <div><b>{it.t}</b><p>{it.d}</p></div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------ caminho do lead (SVG) */
type TipoEstacao = 'cliente' | 'robo' | 'ia' | 'voce';
const ESTACOES: { t: string; s: string[]; tipo: TipoEstacao }[] = [
  { t: 'Anúncio', s: ['no Facebook'], tipo: 'cliente' },
  { t: 'Toque no botão', s: ['abre o WhatsApp'], tipo: 'cliente' },
  { t: 'Robô', s: ['boas-vindas e', 'SIM ou NÃO'], tipo: 'robo' },
  { t: 'Nome e CPF', s: ['o cliente digita'], tipo: 'robo' },
  { t: 'IA: 3 portas', s: ['só no canal', 'de empréstimo'], tipo: 'ia' },
  { t: 'Você', s: ['assume a', 'conversa'], tipo: 'voce' },
];
const EX = (i: number) => 63 + i * 126; // centro de cada estação

function IconeEstacao({ i }: { i: number }) {
  switch (i) {
    case 0: return (
      <g>
        <rect className="mv-cn-ic-papel" x={-15} y={-20} width={30} height={40} rx={4} />
        <circle className="mv-cn-ic-tinta" cx={-8} cy={-13} r={3} />
        <rect className="mv-cn-ic-tinta" x={-3} y={-15} width={13} height={3} rx={1.5} />
        <rect className="mv-cn-ic-azul" x={-11} y={-6} width={22} height={13} rx={2} />
        <rect className="mv-cn-ic-verde" x={-11} y={11} width={22} height={5} rx={2.5} />
      </g>
    );
    case 1: return (
      <g>
        <path className="mv-cn-ic-papel" d="M-16,-14 h32 a4,4 0 0 1 4,4 v16 a4,4 0 0 1 -4,4 h-20 l-8,7 v-7 h-4 a4,4 0 0 1 -4,-4 v-16 a4,4 0 0 1 4,-4z" />
        <circle className="mv-cn-ic-verde" cx={-8} cy={-2} r={2.6} />
        <circle className="mv-cn-ic-verde" cx={0} cy={-2} r={2.6} />
        <circle className="mv-cn-ic-verde" cx={8} cy={-2} r={2.6} />
      </g>
    );
    case 2: return (
      <g>
        <line className="mv-cn-ic-traco" x1={0} y1={-19} x2={0} y2={-13} />
        <circle className="mv-cn-ic-verde" cx={0} cy={-21} r={3} />
        <rect className="mv-cn-ic-papel" x={-16} y={-13} width={32} height={24} rx={6} />
        <circle className="mv-cn-ic-verde" cx={-6} cy={-3} r={3} />
        <circle className="mv-cn-ic-verde" cx={6} cy={-3} r={3} />
        <rect className="mv-cn-ic-tinta" x={-6} y={4} width={12} height={2.6} rx={1.3} />
        <rect className="mv-cn-ic-papel" x={-10} y={13} width={20} height={8} rx={3} />
      </g>
    );
    case 3: return (
      <g>
        <rect className="mv-cn-ic-papel" x={-18} y={-13} width={36} height={26} rx={4} />
        <circle className="mv-cn-ic-verde" cx={-8} cy={-2} r={5} />
        <rect className="mv-cn-ic-tinta" x={0} y={-7} width={13} height={3} rx={1.5} />
        <rect className="mv-cn-ic-tinta" x={0} y={-1} width={10} height={3} rx={1.5} />
        <rect className="mv-cn-ic-tinta" x={0} y={5} width={13} height={3} rx={1.5} />
      </g>
    );
    case 4: return (
      <g>
        {[0, 1, 2].map((k) => (
          <g key={k}>
            <rect className="mv-cn-ic-porta" x={-17 + k * 12} y={-14} width={10} height={24} rx={1.5} />
            <circle className="mv-cn-ic-tinta" cx={-17 + k * 12 + 7.5} cy={-1} r={1.2} />
          </g>
        ))}
        <line className="mv-cn-ic-traco" x1={-21} y1={11} x2={21} y2={11} />
      </g>
    );
    default: return (
      <g>
        <circle className="mv-cn-ic-branco" cx={0} cy={-7} r={7} />
        <path className="mv-cn-ic-branco" d="M-13,17 a13,11 0 0 1 26,0 z" />
        <path className="mv-cn-ic-fone" d="M-10,-7 a10,10 0 0 1 20,0" />
        <path className="mv-cn-ic-fone" d="M10,-5 v4 a3,3 0 0 1 -3,3 h-3" />
      </g>
    );
  }
}

export function CaminhoDoLead() {
  const grupos = [
    { t: 'CLIENTE', de: 0, ate: 1 },
    { t: 'AUTOMÁTICO', de: 2, ate: 4 },
    { t: 'HUMANO', de: 5, ate: 5 },
  ];
  return (
    <div className="mv-cn-rolar">
      <svg className="mv-cn-svg" viewBox="0 0 760 168" role="img"
        aria-label="Caminho do lead: anúncio no Facebook, toque no botão que abre o WhatsApp, robô com boas-vindas e SIM ou NÃO, nome e CPF, IA com as 3 portas (só no canal de empréstimo) e, por fim, você assume a conversa.">
        {grupos.map((g) => {
          const x1 = EX(g.de) - 36, x2 = EX(g.ate) + 36;
          return (
            <g key={g.t}>
              <path className="mv-cn-fio" d={`M${x1},27 v-5 H${x2} v5`} />
              <text className="mv-cn-t3" x={(x1 + x2) / 2} y={14} textAnchor="middle">{g.t}</text>
            </g>
          );
        })}
        {ESTACOES.slice(0, -1).map((_, i) => {
          const a = EX(i) + 41, b = EX(i + 1) - 41;
          return (
            <g key={`s${i}`}>
              <path className="mv-cn-seta" d={`M${a},66 H${b}`} />
              <path className="mv-cn-seta" d={`M${b - 6},61 L${b},66 L${b - 6},71`} />
            </g>
          );
        })}
        {ESTACOES.map((e, i) => (
          <g key={e.t} data-tipo={e.tipo} className="mv-cn-est">
            <rect className="mv-cn-est-caixa" x={EX(i) - 36} y={34} width={72} height={64} rx={14} />
            <g transform={`translate(${EX(i)},66)`}><IconeEstacao i={i} /></g>
            <text className="mv-cn-t" x={EX(i)} y={122} textAnchor="middle">{e.t}</text>
            {e.s.map((l, k) => <text key={l} className="mv-cn-t2" x={EX(i)} y={140 + k * 15} textAnchor="middle">{l}</text>)}
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------ anúncios ilustrados (tela "de fora") */
const ANUNCIOS = [
  {
    canal: 'juros', rot: 'Canal de juros abusivos',
    texto: 'Aposentado(a) ou pensionista do INSS? Você pode estar pagando juros abusivos no seu empréstimo consignado. Fale com a gente e faça uma análise gratuita.',
    arteT: 'Análise gratuita', arteS: 'dos juros do seu empréstimo', glifo: '%',
  },
  {
    canal: 'emprestimo', rot: 'Canal de empréstimo',
    texto: 'Aposentado(a) ou pensionista do INSS? Fale com a gente pelo WhatsApp e faça uma análise para ver se é liberado algum valor para você.',
    arteT: 'Faça sua análise', arteS: 'veja se é liberado algum valor', glifo: 'R$',
  },
];
export function AnunciosIlustrados() {
  return (
    <div className="mv-cn-ads">
      <div className="mv-cn-ads-grade">
        {ANUNCIOS.map((a) => (
          <div key={a.canal} className="mv-cn-ad-col">
            <span className="mv-cn-ad-rot" data-canal={a.canal}>{a.rot}</span>
            <div className="mv-cn-ad" aria-label={`Anúncio ilustrativo do ${a.rot.toLowerCase()}`}>
              <div className="mv-cn-ad-topo">
                <span className="mv-cn-ad-av" aria-hidden>CAF</span>
                <div><b>Central de Assessoria Financeira</b><small>Patrocinado <i className="mv-cn-ad-n">1</i></small></div>
              </div>
              <p className="mv-cn-ad-tx">{a.texto} <i className="mv-cn-ad-n">2</i></p>
              <div className="mv-cn-ad-arte" data-canal={a.canal} aria-hidden>
                <div><b>{a.arteT}</b><span>{a.arteS}</span></div>
                <em>{a.glifo}</em>
              </div>
              <div className="mv-cn-ad-pe">
                <span><small>WHATSAPP</small><b>Fale com a gente</b></span>
                <span className="mv-cn-ad-bt">Enviar mensagem <i className="mv-cn-ad-n">3</i></span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <ol className="mv-cn-ad-leg">
        <li><span className="mv-cn-ad-n">1</span><span><b>Patrocinado</b>: é um anúncio pago. É isso que chamamos de tráfego pago.</span></li>
        <li><span className="mv-cn-ad-n">2</span><span><b>O texto</b> fala direto com aposentado e pensionista do INSS, e já mostra o assunto do canal.</span></li>
        <li><span className="mv-cn-ad-n">3</span><span><b>O botão</b> abre a conversa no WhatsApp. O robô responde na mesma hora.</span></li>
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------ ponto de partida de cada canal (SVG) */
export function PontoDePartida() {
  const linhas = [
    { y: 72, pos: 540, cor: 'azul', titulo: 'Juros abusivos: já quer a revisão', ja: 'já percorreu sozinho: veio pela revisão', falta: 'falta pouco: explicar e confirmar' },
    { y: 152, pos: 170, cor: 'ambar', titulo: 'Empréstimo: quer dinheiro rápido', ja: 'começa longe', falta: 'falta mais: entender, verificar, mostrar caminhos e convencer' },
  ];
  return (
    <div className="mv-cn-rolar">
    <svg className="mv-cn-svg" viewBox="0 0 760 196" role="img"
      aria-label="Duas trilhas até o SIM ao processo. O cliente de juros abusivos começa perto da meta; falta explicar e confirmar. O cliente de empréstimo começa longe; falta entender, verificar, mostrar caminhos e convencer.">
      <text className="mv-cn-t-meta" x={704} y={22} textAnchor="end">Meta: SIM ao processo</text>
      {linhas.map((l) => (
        <g key={l.y} data-cor={l.cor} className="mv-cn-trilha">
          <text className="mv-cn-t" x={60} y={l.y - 20}>{l.titulo}</text>
          <line className="mv-cn-trilha-fundo" x1={60} y1={l.y} x2={690} y2={l.y} />
          <line className="mv-cn-trilha-feita" x1={60} y1={l.y} x2={l.pos} y2={l.y} />
          <line className="mv-cn-trilha-falta" x1={l.pos + 16} y1={l.y} x2={674} y2={l.y} />
          <circle className="mv-cn-trilha-cli" cx={l.pos} cy={l.y} r={11} />
          <circle className="mv-cn-trilha-cli-in" cx={l.pos} cy={l.y} r={4.5} />
          <circle className="mv-cn-meta" cx={690} cy={l.y} r={12} />
          <path className="mv-cn-meta-ok" d={`M684,${l.y} l4,4 l8,-8`} />
          {l.ja && <text className="mv-cn-t2" x={(60 + l.pos) / 2} y={l.y + 30} textAnchor="middle">{l.ja}</text>}
          <text className="mv-cn-t2" x={(l.pos + 690) / 2} y={l.y + 30} textAnchor="middle">{l.falta}</text>
        </g>
      ))}
    </svg>
    </div>
  );
}

/* ------------------------------------------------------------ simulador das 3 portas */
type R1 = 'sim' | 'nao';
type R3 = 'sim' | 'nao' | 'naosabe';
type Fim = { ok: boolean; titulo: string; texto: ReactNode };
const FINANCEIRAS = ['Agibank', 'BMG', 'Facta', 'Mercantil', 'Crefisa'];

export function SimuladorPortas() {
  const [porta, setPorta] = useState<1 | 2 | 3>(1);
  const [r1, setR1] = useState<R1 | null>(null);
  const [r2, setR2] = useState<R1 | null>(null);
  const [naoSabe, setNaoSabe] = useState(false);
  const [fim, setFim] = useState<Fim | null>(null);

  function reiniciar() { setPorta(1); setR1(null); setR2(null); setNaoSabe(false); setFim(null); }
  function responder1(r: R1) { setR1(r); setPorta(r === 'sim' ? 3 : 2); }
  function responder2(r: R1) {
    setR2(r);
    if (r === 'sim') setPorta(3);
    else setFim({ ok: false, titulo: 'Não elegível', texto: 'Nem a pessoa nem alguém da família recebe do INSS. A IA agradece com carinho e encerra, sem insistir.' });
  }
  function responder3(r: R3) {
    if (r === 'naosabe' && !naoSabe) { setNaoSabe(true); return; }
    if (r === 'nao') {
      setFim({ ok: false, titulo: 'Não elegível', texto: 'O empréstimo não é em nenhuma das 5 financeiras. A IA explica que a CAF só trabalha com essas, agradece e encerra, sem insistir.' });
      return;
    }
    setFim({
      ok: true, titulo: 'Pré-aprovada',
      texto: (
        <>
          A IA avisa que vai fazer a análise, espera uns 5 minutos e manda a mensagem de <b>pré-aprovada</b> com a lista de documentos.
          Depois pergunta sobre o gov.br e o Meu INSS e passa a conversa para você.
          {r2 === 'sim' && <> <b>Atenção:</b> a análise segue pelo benefício do familiar, então os documentos passam a ser do familiar que recebe. Na dúvida, pergunte ao gestor.</>}
          {r === 'naosabe' && <> <b>{r2 === 'sim' ? 'E mais:' : 'Atenção:'}</b> o cliente não soube dizer a financeira. Confira nos extratos do INSS.</>}
        </>
      ),
    });
  }

  /* porta 2 só existe para quem NÃO recebe; no fim, a última porta alcançada aprova ou barra */
  const estado = (n: 1 | 2 | 3): string => {
    if (n === 2 && r1 === 'sim') return 'pulada';
    if (!fim) return n === porta ? 'atual' : n < porta ? 'feita' : 'nada';
    if (n === porta) return fim.ok ? 'feita' : 'barrou';
    return n < porta ? 'feita' : 'nada';
  };
  const rotEstado: Record<string, string> = { atual: 'agora', feita: 'respondida', pulada: 'não precisou', barrou: 'parou aqui', nada: 'ainda não' };

  return (
    <div className="vidro mv-cn-sim">
      <div className="mv-cn-sim-cab">
        <span className="mv-cn-sim-tag">Simulador · a IA nas 3 portas</span>
        <button type="button" className="mv-link" onClick={reiniciar}>Recomeçar</button>
      </div>
      <ol className="mv-cn-sim-portas" aria-label="Andamento pelas 3 portas">
        {([1, 2, 3] as const).map((n) => (
          <li key={n} data-estado={estado(n)}>
            <span className="mv-cn-porta" aria-hidden><i /></span>
            <span><b>Porta {n}</b><small>{rotEstado[estado(n)]}</small></span>
          </li>
        ))}
      </ol>

      {!fim && porta === 1 && (
        <div className="mv-cn-sim-q">
          <p className="mv-cn-sim-p">A pessoa recebe algum benefício do INSS?</p>
          <p className="mv-cn-sim-ajuda">Qualquer um serve: aposentadoria, pensão, auxílio, BPC/LOAS.</p>
          <div className="mv-cn-sim-bts">
            <button type="button" data-tom="verde" onClick={() => responder1('sim')}><IcCheck />Sim, recebe</button>
            <button type="button" data-tom="rubro" onClick={() => responder1('nao')}><IcX />Não recebe</button>
          </div>
        </div>
      )}
      {!fim && porta === 2 && (
        <div className="mv-cn-sim-q">
          <p className="mv-cn-sim-p">Algum familiar recebe do INSS?</p>
          <p className="mv-cn-sim-ajuda">Pai, mãe, avó, avô ou filho. Se sim, a análise segue pelo benefício do familiar.</p>
          <div className="mv-cn-sim-bts">
            <button type="button" data-tom="verde" onClick={() => responder2('sim')}><IcCheck />Sim, um familiar recebe</button>
            <button type="button" data-tom="rubro" onClick={() => responder2('nao')}><IcX />Ninguém recebe</button>
          </div>
        </div>
      )}
      {!fim && porta === 3 && (
        <div className="mv-cn-sim-q">
          <p className="mv-cn-sim-p">Tem empréstimo em alguma destas financeiras?</p>
          <div className="mv-cn-sim-fin">{FINANCEIRAS.map((f) => <span key={f}>{f}</span>)}</div>
          {naoSabe && (
            <p className="mv-cn-sim-reask">
              O cliente não soube responder. A IA pergunta de novo, uma vez: “aparece algum desconto de Agibank, BMG, Facta, Mercantil ou Crefisa no benefício?”
            </p>
          )}
          <div className="mv-cn-sim-bts">
            <button type="button" data-tom="verde" onClick={() => responder3('sim')}><IcCheck />Sim, tem</button>
            <button type="button" data-tom="rubro" onClick={() => responder3('nao')}><IcX />Não, em nenhuma</button>
            <button type="button" onClick={() => responder3('naosabe')}>{naoSabe ? 'Continua sem saber' : 'Não sabe dizer'}</button>
          </div>
        </div>
      )}
      {fim && (
        <div className="mv-cn-sim-fim" data-ok={fim.ok ? '' : undefined} role="status">
          <b>{fim.ok ? <IcCheck /> : <IcX />}{fim.titulo}</b>
          <p>{fim.texto}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ o que chega na sua mão */
type ItemFicha = { t: string; ok: boolean };
const FICHAS: { canal: string; titulo: string; itens: ItemFicha[]; espera: string }[] = [
  {
    canal: 'juros', titulo: 'Canal de juros abusivos',
    itens: [
      { t: 'Nome completo', ok: true },
      { t: 'CPF', ok: true },
      { t: 'Disse SIM à análise gratuita', ok: true },
      { t: 'Recebeu o vídeo de boas-vindas', ok: true },
      { t: 'Leu que os dados são só para a consulta', ok: true },
      { t: 'A atualização que o robô prometeu', ok: false },
      { t: 'Benefício do INSS confirmado', ok: false },
      { t: 'Financeira confirmada', ok: false },
      { t: 'Processo explicado', ok: false },
      { t: 'Documentos recebidos', ok: false },
    ],
    espera: 'Uma atualização “em alguns minutos”, como o robô prometeu.',
  },
  {
    canal: 'emprestimo', titulo: 'Canal de empréstimo',
    itens: [
      { t: 'Nome completo', ok: true },
      { t: 'CPF', ok: true },
      { t: 'Passou pelas 3 portas', ok: true },
      { t: 'Recebeu a mensagem de pré-aprovada', ok: true },
      { t: 'Recebeu a lista de documentos', ok: true },
      { t: 'Respondeu sobre gov.br e Meu INSS', ok: true },
      { t: 'Pré-aprovada explicada com honestidade', ok: false },
      { t: 'O que ele precisa (pergunta aberta)', ok: false },
      { t: 'Extratos do INSS conferidos', ok: false },
      { t: 'Margem explicada e caminhos mostrados', ok: false },
    ],
    espera: 'Um analista “em instantes”, e com a ideia de que o dinheiro está perto.',
  },
];
export function FichasNaMao() {
  return (
    <div className="mv-cn-fichas">
      {FICHAS.map((f) => (
        <div key={f.canal} className="vidro mv-cn-ficha" data-canal={f.canal}>
          <span className="mv-cn-ficha-clip" aria-hidden />
          <header><small>O que chega na sua mão</small><b>{f.titulo}</b></header>
          <ul>
            {f.itens.map((it) => (
              <li key={it.t} data-ok={it.ok ? '' : undefined}>
                <span className="mv-cn-ficha-ic">{it.ok ? <IcCheck /> : null}</span>
                <span>{it.t}</span>
                <small>{it.ok ? 'pronto' : 'com você'}</small>
              </li>
            ))}
          </ul>
          <footer><small>O cliente está esperando</small><span>{f.espera}</span></footer>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ pré-aprovada: o que é e o que não é */
const ENE_SIM = [
  'A análise inicial passou nas perguntas da IA (as 3 portas).',
  'Dá para seguir: o próximo passo é conferir os extratos.',
  'O seu trabalho com esse cliente está só começando.',
];
const ENE_NAO = [
  'Valor liberado ou empréstimo aprovado pelo banco.',
  'Que alguém já conferiu os extratos ou a margem.',
  'Promessa de valor, de prazo ou de que o dinheiro vai cair.',
];
export function PreAprovadaEeNao() {
  return (
    <div className="mv-cn-ene" role="group" aria-label="O que a mensagem de pré-aprovada quer dizer e o que ela não quer dizer">
      <div className="mv-cn-ene-msg">
        <small>Mensagem da IA</small>
        <p>Boa notícia, José! Sua análise foi *pré-aprovada*.</p>
      </div>
      <div className="mv-cn-ene-grade">
        <div className="vidro mv-cn-ene-col" data-tom="verde">
          <b><span className="mv-cn-ene-ic"><IcCheck /></span>O que ela quer dizer</b>
          <ul>{ENE_SIM.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
        <div className="vidro mv-cn-ene-col" data-tom="rubro">
          <b><span className="mv-cn-ene-ic"><IcX /></span>O que ela não quer dizer</b>
          <ul>{ENE_NAO.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ régua da pré-aprovação (SVG) */
const ETAPAS_REGUA = [
  { t: 'Disse SIM', s: 'nome e CPF' },
  { t: 'Pré-aprovada', s: 'passou nas 3 portas' },
  { t: 'Extratos', s: 'do INSS na mão' },
  { t: 'Verificação', s: 'margem e contratos' },
  { t: 'Resposta clara', s: 'o que é possível' },
];
export function ReguaPreAprovada() {
  const x = (i: number) => 80 + i * 140;
  return (
    <div className="mv-cn-rolar">
    <svg className="mv-cn-svg" viewBox="0 0 760 184" role="img"
      aria-label="Régua com cinco etapas: disse SIM, pré-aprovada, extratos do INSS, verificação da margem e resposta clara. O cliente está na etapa da pré-aprovação, mas acha que já está na última.">
      <rect className="mv-cn-pin-real" x={155} y={36} width={130} height={30} rx={8} />
      <path className="mv-cn-pin-real" d="M212,66 L220,76 L228,66 z" />
      <text className="mv-cn-pin-real-t" x={220} y={56} textAnchor="middle">Ele está aqui</text>
      <rect className="mv-cn-pin-ilusao" x={555} y={36} width={170} height={30} rx={8} />
      <text className="mv-cn-pin-ilusao-t" x={640} y={56} textAnchor="middle">Ele acha que está aqui</text>
      <path className="mv-cn-pin-fio" d="M640,67 V104" />
      <path className="mv-cn-pin-fio" d="M220,77 V104" />
      <text className="mv-cn-t2" x={420} y={30} textAnchor="middle">a distância entre os dois</text>
      <text className="mv-cn-t2" x={420} y={45} textAnchor="middle">é o que você explica com calma</text>
      <path className="mv-cn-seta" d="M300,60 H540" />
      <path className="mv-cn-seta" d="M306,55 L300,60 L306,65" />
      <path className="mv-cn-seta" d="M534,55 L540,60 L534,65" />
      <line className="mv-cn-regua-fundo" x1={x(0)} y1={120} x2={x(4)} y2={120} />
      <line className="mv-cn-regua-feita" x1={x(0)} y1={120} x2={x(1)} y2={120} />
      {ETAPAS_REGUA.map((e, i) => (
        <g key={e.t} className="mv-cn-regua-et" data-feita={i <= 1 ? '' : undefined}>
          <circle cx={x(i)} cy={120} r={13} />
          <text className="mv-cn-regua-n" x={x(i)} y={124} textAnchor="middle">{i + 1}</text>
          <text className="mv-cn-t" x={x(i)} y={156} textAnchor="middle">{e.t}</text>
          <text className="mv-cn-t2" x={x(i)} y={173} textAnchor="middle">{e.s}</text>
        </g>
      ))}
    </svg>
    </div>
  );
}

/* ------------------------------------------------------------ fluxo completo por canal (interativo) */
type Quem = 'cliente' | 'robo' | 'ia' | 'voce' | 'advogado';
type Etapa = { quem: Quem; t: string; curto: string; det: ReactNode; venda?: boolean };
const QUEM_TX: Record<Quem, string> = { cliente: 'Cliente', robo: 'Robô', ia: 'IA', voce: 'Você', advogado: 'Processo' };
const ETAPA_DOCS: Etapa = {
  quem: 'voce', t: 'Documentos', curto: 'Meu INSS, gov.br, pessoais',
  det: (
    <>
      No <b>Meu INSS</b>: carta de concessão, extrato de empréstimo consignado e os extratos de pagamento dos últimos 10 anos.
      No <b>gov.br</b> (portal Meu Imposto de Renda): o imposto de renda dos últimos 3 anos. No <b>site da Receita</b>: a
      situação cadastral do CPF. E os <b>documentos pessoais</b>: identidade, comprovante de residência (do mês atual ou do mês
      passado) e e-mail. Essa é a ordem sugerida, mas não é rígida: o cliente pode mandar primeiro o que tiver em mãos. Cada
      parte tem a sua lição no módulo de Documentação.
    </>
  ),
};
const ETAPA_PROCESSO: Etapa = {
  quem: 'advogado', t: 'Processo', curto: 'cadastro, procurações e ação',
  det: (
    <>
      O cliente é cadastrado no sistema, as procurações são assinadas pelo gov.br (conta prata ou ouro) e o
      <b> Dr. Rafael Menezes</b> entra com a ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos.
      Costuma levar de 6 a 12 meses. O cliente não paga nada para começar: 30% de honorários só no final, tirados do que ele receber.
    </>
  ),
};
const FLUXOS: Record<'juros' | 'emprestimo', { rot: string; venda: string; etapas: Etapa[] }> = {
  juros: {
    rot: 'Juros abusivos', venda: 'Venda mais direta: o cliente já quer a revisão.',
    etapas: [
      { quem: 'cliente', t: 'Anúncio', curto: 'de juros abusivos', det: 'O aposentado ou pensionista vê no Facebook o anúncio sobre os juros do empréstimo e toca no botão. O WhatsApp abre numa conversa com a CAF.' },
      { quem: 'robo', t: 'Robô', curto: 'vídeo, SIM, nome e CPF', det: 'Boas-vindas, vídeo de 30 segundos, convite para a análise gratuita, SIM ou NÃO, nome completo e CPF. Termina prometendo uma atualização “em alguns minutos”.' },
      {
        quem: 'voce', t: 'Você', curto: 'confirma e explica', venda: true,
        det: 'Você dá a atualização prometida, confere as 3 portas (benefício do INSS, familiar, financeira) e explica o processo: gratuito para começar, 30% só no final e prazo que costuma ser de 6 a 12 meses. Como o cliente já quer a revisão, a conversa tende a ser mais direta.',
      },
      ETAPA_DOCS,
      ETAPA_PROCESSO,
    ],
  },
  emprestimo: {
    rot: 'Empréstimo', venda: 'Venda consultiva: é preciso entender, verificar e convencer.',
    etapas: [
      { quem: 'cliente', t: 'Anúncio', curto: 'de empréstimo', det: 'A pessoa vê um anúncio para ver se é liberado algum valor e toca no botão. Ela chega querendo dinheiro rápido.' },
      { quem: 'robo', t: 'Robô', curto: 'imagem, SIM, nome e CPF', det: 'Imagem de boas-vindas, convite para a análise, SIM ou NÃO, nome e CPF. Termina dizendo que “em instantes um analista vai falar com você”.' },
      { quem: 'ia', t: 'IA', curto: '3 portas e pré-aprovada', det: 'A IA confere as 3 portas, avisa que vai analisar e, uns 5 minutos depois, manda a pré-aprovação e a lista de documentos. Pergunta sobre a senha do gov.br e o Meu INSS e passa a conversa para você. Ela nunca cita valores, taxas ou juros.' },
      {
        quem: 'voce', t: 'Você', curto: 'verifica e convence', venda: true,
        det: 'Você se apresenta, explica com honestidade o que é a pré-aprovada (a análise inicial passou nas perguntas; não é valor liberado), pergunta o que a pessoa precisa e pede os extratos do Meu INSS. Conferida a margem: sem margem, explica com clareza e apresenta os caminhos, sempre como possibilidade: aumento de margem, portabilidade (que pode liberar um valor acima de R$\u00a01.500) e o processo. É aqui que a venda acontece.',
      },
      ETAPA_DOCS,
      ETAPA_PROCESSO,
    ],
  },
};
export function FluxoPorCanal() {
  const [canal, setCanal] = useState<'juros' | 'emprestimo'>('juros');
  const [sel, setSel] = useState(0);
  const f = FLUXOS[canal];
  const et = f.etapas[Math.min(sel, f.etapas.length - 1)];
  return (
    <div className="vidro mv-cn-fluxo">
      <div className="mv-cn-fluxo-cab">
        <div className="mv-cn-abas" role="tablist" aria-label="Escolha o canal">
          {(['juros', 'emprestimo'] as const).map((c) => (
            <button key={c} type="button" role="tab" aria-selected={canal === c} data-canal={c}
              onClick={() => { setCanal(c); setSel(0); }}>{FLUXOS[c].rot}</button>
          ))}
        </div>
        <span className="mv-cn-fluxo-venda">{f.venda}</span>
      </div>
      <ol className="mv-cn-fluxo-lista" aria-label={`Etapas do canal de ${f.rot.toLowerCase()}`}>
        {f.etapas.map((e, i) => (
          <li key={e.t + i}>
            <button type="button" data-quem={e.quem} aria-pressed={sel === i} onClick={() => setSel(i)}>
              <small>{QUEM_TX[e.quem]}</small>
              <b>{e.t}</b>
              <span>{e.curto}</span>
              {e.venda && <em>hora da venda</em>}
            </button>
          </li>
        ))}
      </ol>
      <div className="mv-cn-fluxo-det" data-quem={et.quem} role="status">
        <b><span className="num">{Math.min(sel, f.etapas.length - 1) + 1}</span>{et.t}</b>
        <p>{et.det}</p>
      </div>
      <p className="mv-cn-fluxo-dica">Toque em cada etapa para ver o que acontece e quem faz.</p>
    </div>
  );
}

/* ------------------------------------------------------------ árvore do NÃO */
const RAMOS_NAO = [
  { tom: 'neutro', se: 'Não escreveu mais nada', faca: 'Deixe assim. Não mande mensagem cobrando resposta: a porta já ficou aberta.' },
  { tom: 'verde', se: 'Mandou SIM depois', faca: 'A análise segue normalmente, e a conversa chega até você como qualquer outra.' },
  { tom: 'azul', se: 'Voltou com uma dúvida', faca: 'Responda com calma e com a verdade. Responder dúvida não é insistir. Se ele repetir que não quer, agradeça e encerre.' },
];
export function ArvoreNao() {
  return (
    <div className="mv-cn-arv" role="group" aria-label="O que fazer quando o cliente responde NÃO">
      <div className="vidro mv-cn-arv-raiz">
        <b>O cliente respondeu NÃO ao robô</b>
        <span>O robô já respondeu sozinho, sem pressão, e deixou a porta aberta.</span>
      </div>
      <div className="mv-cn-arv-ramos">
        {RAMOS_NAO.map((r) => (
          <div key={r.se} className="vidro mv-cn-arv-ramo" data-tom={r.tom}>
            <small>Se ele…</small>
            <b>{r.se}</b>
            <p>{r.faca}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ treino: de qual canal é esta mensagem? */
type CanalId = 'juros' | 'emprestimo';
const MSGS_TREINO: { msg: string; canal: CanalId; porque: string }[] = [
  { msg: 'Assista esse video, leva apenas 30 segundos.', canal: 'juros', porque: 'O vídeo de boas-vindas é do canal de juros. No canal de empréstimo, as boas-vindas vêm numa imagem.' },
  { msg: 'Gostaria de fazer uma análise pra ver se é liberado algum valor', canal: 'emprestimo', porque: '“Ver se é liberado algum valor” é o convite do canal de empréstimo: fala com quem quer dinheiro.' },
  { msg: 'Sua análise foi iniciada. Em alguns minutos retorno aqui com uma atualização.', canal: 'juros', porque: 'É o fim da conversa do robô no canal de juros. O cliente está esperando a sua atualização.' },
  { msg: 'Boa notícia, José! Sua análise foi *pré-aprovada*.', canal: 'emprestimo', porque: 'A pré-aprovação é mandada pela IA do canal de empréstimo, depois das 3 portas.' },
  { msg: 'Gostaria de fazer *análise gratuita* pra descobrir se você paga juros abusivos e recuperar valores?', canal: 'juros', porque: 'Fala de juros abusivos e de análise gratuita: é o convite do canal de juros.' },
  { msg: 'Em instantes um analista vai falar com você aqui mesmo.', canal: 'emprestimo', porque: 'É o fim da recepção do robô no canal de empréstimo. Logo depois, a IA assume.' },
];
export function QualCanal() {
  const [resp, setResp] = useState<Record<number, CanalId>>({});
  const feitos = Object.keys(resp).length;
  const acertos = MSGS_TREINO.filter((m, i) => resp[i] === m.canal).length;
  return (
    <div className="mv-cn-qc">
      {MSGS_TREINO.map((m, i) => {
        const r = resp[i];
        const certo = r === m.canal;
        return (
          <div key={m.msg} className="vidro mv-cn-qc-it" data-estado={r === undefined ? undefined : certo ? 'certo' : 'errado'}>
            <p className="mv-cn-qc-msg">{m.msg}</p>
            {r === undefined ? (
              <div className="mv-cn-qc-bts">
                <button type="button" data-canal="juros" onClick={() => setResp((s) => ({ ...s, [i]: 'juros' }))}>Juros abusivos</button>
                <button type="button" data-canal="emprestimo" onClick={() => setResp((s) => ({ ...s, [i]: 'emprestimo' }))}>Empréstimo</button>
              </div>
            ) : (
              <p className="mv-cn-qc-r"><b>{certo ? 'Acertou.' : 'Errou.'}</b> {m.porque}</p>
            )}
          </div>
        );
      })}
      {feitos === MSGS_TREINO.length && (
        <div className="mv-cn-qc-fim" role="status">
          <b className="num">{acertos} de {MSGS_TREINO.length}</b> acertos.
          <button type="button" className="mv-link" onClick={() => setResp({})}>Treinar de novo</button>
        </div>
      )}
    </div>
  );
}
