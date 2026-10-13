/* Lição 13 — ilustrações e interativos próprios (prefixo mv-as-): mapa do
   fechamento, procuração ilustrada (modelo genérico), pilares da assinatura
   gov.br, escada bronze → prata → ouro (clicável), telas genéricas do app
   gov.br (subir para prata e para ouro), fluxo da assinatura em 4 passos,
   diagnóstico "o cliente consegue assinar?", linha do tempo depois da
   assinatura e checklist de fechamento.
   Telas "de fora" (app gov.br, WhatsApp do cliente, papel da procuração) têm
   paleta própria e levam a tag "Ilustração". Nada aqui mostra telas do sistema
   admin: o dono pediu para deixar o cadastro vago. */
import { useState, type ReactNode } from 'react';
import { Figura, IcCheck, IcX } from '../pecas';

/* ===================================================================== ícones de traço */
type IcNome = 'pasta' | 'cadastro' | 'doc' | 'caneta' | 'balanca' | 'selo' | 'escudo' | 'casa';
const ICONES: Record<IcNome, ReactNode> = {
  pasta: <path d="M3.5 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8.5a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />,
  cadastro: (<><rect x="4" y="3.5" width="16" height="17" rx="2" /><circle cx="12" cy="10" r="2.6" /><path d="M7.8 16.6c.8-1.8 2.3-2.8 4.2-2.8s3.4 1 4.2 2.8" /></>),
  doc: (<><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h4" /></>),
  caneta: (<><path d="M15.5 4.5l4 4L9 19l-5 1 1-5z" /><path d="M13.5 6.5l4 4" /></>),
  balanca: (<><path d="M12 4v15M8 19.5h8M5 7h14" /><path d="M5 7l-2.5 6a2.8 2.8 0 005 0zM19 7l-2.5 6a2.8 2.8 0 005 0z" /></>),
  selo: (<><circle cx="12" cy="9.5" r="5.5" /><path d="M9.2 14.3L8 20.5l4-2.2 4 2.2-1.2-6.2" /></>),
  escudo: (<><path d="M12 3.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6.3z" /><path d="M8.8 12.2l2.2 2.2 4.4-4.6" /></>),
  casa: (<><path d="M4 11l8-6.5 8 6.5" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>),
};
function Ic({ n }: { n: IcNome }) {
  return (
    <svg className="mv-as-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONES[n]}</svg>
  );
}

type Nivel = 'bronze' | 'prata' | 'ouro';
function Medalha({ n }: { n: Nivel }) {
  return <span className="mv-as-medalha" data-nivel={n} aria-hidden />;
}

/* ===================================================================== mapa do fechamento */
const MAPA: { t: string; d: string; fase: 'docs' | 'fecha' | 'proc'; ic: IcNome; chips?: string[] }[] = [
  { t: 'Documentação completa', d: 'Tudo o que você juntou nas lições anteriores.', fase: 'docs', ic: 'pasta', chips: ['Meu INSS', 'gov.br', 'Pessoais'] },
  { t: 'Cadastro no admin', d: 'Você cadastra o cliente no sistema.', fase: 'fecha', ic: 'cadastro' },
  { t: 'Procurações', d: 'O cadastro gera as procurações.', fase: 'fecha', ic: 'doc' },
  { t: 'Assinatura gov.br', d: 'O cliente assina com a conta prata ou ouro.', fase: 'fecha', ic: 'caneta' },
  { t: 'Ação na Justiça', d: 'O advogado entra com a ação sobre os juros do empréstimo pessoal.', fase: 'proc', ic: 'balanca' },
];
export function MapaFechamento() {
  return (
    <Figura legenda="O caminho do fechamento. As etapas 1 a 4 passam por você; a 5 é com o advogado.">
      <ol className="mv-as-mapa" aria-label="Etapas do fechamento: documentação completa, cadastro no admin, procurações, assinatura gov.br e ação na Justiça">
        {MAPA.map((e, i) => (
          <li key={e.t} data-fase={e.fase}>
            <span className="mv-as-mapa-topo"><span className="mv-as-mapa-n num">{i + 1}</span><Ic n={e.ic} /></span>
            <b>{e.t}</b>
            <small>{e.d}</small>
            {e.chips && <span className="mv-as-mapa-chips">{e.chips.map((c) => <i key={c}>{c}</i>)}</span>}
          </li>
        ))}
      </ol>
      <div className="mv-as-mapa-leg" aria-hidden>
        <span data-fase="docs"><i />Documentação (lições 10 a 12)</span>
        <span data-fase="fecha"><i />Fechamento (esta lição)</span>
        <span data-fase="proc"><i />Processo (advogado)</span>
      </div>
    </Figura>
  );
}

/* ===================================================================== procuração ilustrada */
export function ProcuracaoIlustrada() {
  return (
    <figure className="mv-as-proc">
      <div className="mv-as-proc-grade">
        {/* papel: paleta própria (documento impresso), igual nos dois temas */}
        <div className="mv-as-papel">
          <div className="mv-as-papel-cab"><b>PROCURAÇÃO</b><small>modelo ilustrativo</small></div>
          <div className="mv-as-papel-bloco">
            <span className="mv-as-marca num" aria-hidden>1</span>
            <p><b>OUTORGANTE:</b> MARIA DA SILVA (exemplo), aposentada, CPF 000.000.000-00, residente em [endereço do comprovante]…</p>
            <i className="mv-as-papel-lin" style={{ width: '86%' }} />
          </div>
          <div className="mv-as-papel-bloco">
            <span className="mv-as-marca num" aria-hidden>2</span>
            <p><b>OUTORGADO:</b> [advogado responsável pelo processo]…</p>
            <i className="mv-as-papel-lin" style={{ width: '64%' }} />
          </div>
          <div className="mv-as-papel-bloco">
            <span className="mv-as-marca num" aria-hidden>3</span>
            <p><b>PODERES:</b> para representar a outorgante no processo, agindo em seu nome…</p>
            <i className="mv-as-papel-lin" style={{ width: '94%' }} />
            <i className="mv-as-papel-lin" style={{ width: '72%' }} />
          </div>
          <p className="mv-as-papel-data">[cidade], [data]</p>
          <div className="mv-as-papel-bloco">
            <span className="mv-as-marca num" aria-hidden>4</span>
            <div className="mv-as-selo">
              <b>gov.br</b>
              <span>
                <span>Documento assinado digitalmente</span>
                <strong>MARIA DA SILVA</strong>
                <span>Data: [dia e hora da assinatura]</span>
                <span>Pode ser conferido no validador oficial</span>
              </span>
            </div>
          </div>
        </div>
        <ol className="mv-as-proc-leg">
          <li><span className="num">1</span><div><b>Quem dá a autorização</b><small>O <em>outorgante</em>: o cliente, identificado com os dados dele (nome, CPF, endereço).</small></div></li>
          <li><span className="num">2</span><div><b>Quem recebe a autorização</b><small>O <em>outorgado</em>: o advogado que vai entrar com a ação.</small></div></li>
          <li><span className="num">3</span><div><b>O que ele pode fazer</b><small>Os <em>poderes</em>: agir em nome do cliente no processo.</small></div></li>
          <li><span className="num">4</span><div><b>A assinatura</b><small>Digital, pelo gov.br. Fica registrada no documento com o nome de quem assinou e a data.</small></div></li>
        </ol>
      </div>
      <figcaption><span className="mv-tag">Ilustração</span>Modelo genérico, só para você reconhecer as partes. O documento de verdade sai do sistema, no cadastro.</figcaption>
    </figure>
  );
}

/* ===================================================================== pilares da assinatura gov.br */
const PILARES: { ic: IcNome; t: string; d: string }[] = [
  { ic: 'selo', t: 'Oficial', d: 'É o serviço de assinatura do governo federal, feito com a conta gov.br. O documento assinado assim tem validade jurídica, como uma assinatura no papel.' },
  { ic: 'escudo', t: 'Segura', d: 'Só quem tem a conta consegue assinar, e ela precisa estar em prata ou ouro. A assinatura fica gravada no arquivo, com nome e data, e pode ser conferida.' },
  { ic: 'casa', t: 'Prática', d: 'Gratuita, pelo celular, sem cartório, sem imprimir e sem sair de casa. Para o cliente idoso, isso faz muita diferença.' },
];
export function PilaresAssinatura() {
  return (
    <div className="mv-as-pilares">
      {PILARES.map((p) => (
        <div key={p.t} className="vidro mv-as-pilar">
          <span className="mv-as-pilar-ic"><Ic n={p.ic} /></span>
          <b>{p.t}</b>
          <p>{p.d}</p>
        </div>
      ))}
    </div>
  );
}

/* ===================================================================== escada bronze → prata → ouro */
type Degrau = {
  id: Nivel; nome: string; assina: boolean; x: number; y: number; w: number; extra: string[];
  oque: string; como: string; dica: string;
};
const CHAO = 270;
const DEGRAUS: Degrau[] = [
  {
    id: 'bronze', nome: 'Bronze', assina: false, x: 30, y: 205, w: 210, extra: [],
    oque: 'O nível de entrada. A conta foi criada só com o CPF e dados básicos: o governo ainda não confirmou, por outro meio, que quem usa a conta é mesmo a pessoa.',
    como: 'Para sair daqui: validar com um banco (vai para prata) ou fazer o reconhecimento facial (vai para ouro).',
    dica: 'Não adianta mandar a procuração com a conta em bronze: o gov.br não deixa assinar. Suba o nível primeiro.',
  },
  {
    id: 'prata', nome: 'Prata', assina: true, x: 250, y: 140, w: 210, extra: ['Confirmado', 'pelo banco'],
    oque: 'Um banco onde o cliente tem conta confirmou para o gov.br que ele é ele mesmo. O banco já tinha conferido os documentos quando abriu a conta.',
    como: 'No app gov.br: aumentar o nível, escolher validar com um banco, escolher o banco na lista e entrar com o login do banco.',
    dica: 'A senha do banco é só do cliente: ele digita sozinho. Você nunca pede senha de banco.',
  },
  {
    id: 'ouro', nome: 'Ouro', assina: true, x: 470, y: 75, w: 220, extra: ['Confirmado', 'pelo rosto'],
    oque: 'O nível mais alto. A conta foi confirmada pelo rosto do cliente (reconhecimento facial), comparado com uma foto que o governo já tem dele.',
    como: 'No app gov.br: aumentar o nível e escolher o reconhecimento facial. A câmera do celular faz a comparação. Em geral, dá para ir do bronze direto para o ouro.',
    dica: 'Quem aparece na câmera é sempre o titular da conta. Lugar bem claro, sem óculos escuros nem boné, celular parado na altura do rosto.',
  },
];
export function EscadaNiveis() {
  const [sel, setSel] = useState<Nivel>('bronze');
  const d = DEGRAUS.find((g) => g.id === sel) ?? DEGRAUS[0];
  return (
    <div className="vidro mv-as-esc">
      <div className="mv-as-rolar">
        <svg className="mv-as-svg mv-as-esc-svg" viewBox="0 0 720 312" role="img"
          aria-label="Escada dos níveis da conta gov.br. Bronze, o degrau de baixo, não assina. Do bronze se sobe para prata validando com o banco, ou para ouro com o reconhecimento facial. Prata e ouro assinam as procurações.">
          <defs>
            <linearGradient id="mv-as-gr-bronze" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#D59A6A" /><stop offset="1" stopColor="#8E5A33" /></linearGradient>
            <linearGradient id="mv-as-gr-prata" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E9ECF0" /><stop offset="1" stopColor="#9AA3AE" /></linearGradient>
            <linearGradient id="mv-as-gr-ouro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F2D57E" /><stop offset="1" stopColor="#B88A1E" /></linearGradient>
            <marker id="mv-as-seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path className="mv-as-esc-ponta" d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>

          <line className="mv-as-esc-chao" x1="16" y1={CHAO} x2="704" y2={CHAO} />

          {/* caminhos para subir */}
          {/* as pontas pousam no topo do degrau de destino (prata y=140, ouro y=75) */}
          <path className="mv-as-esc-seta" data-tracejada="" d="M72,199 C72,60 330,10 562,70" markerEnd="url(#mv-as-seta)" />
          <text className="mv-as-esc-rot" x="372" y="28" textAnchor="middle">reconhecimento facial → ouro</text>
          <path className="mv-as-esc-seta" d="M214,199 C218,130 262,96 304,135" markerEnd="url(#mv-as-seta)" />
          <text className="mv-as-esc-rot" x="318" y="126">pelo banco → prata</text>

          {DEGRAUS.map((g) => (
            <g key={g.id} className="mv-as-esc-deg" data-sel={sel === g.id ? '' : undefined} onClick={() => setSel(g.id)}>
              <rect className="mv-as-esc-bloco" x={g.x} y={g.y} width={g.w} height={CHAO - g.y} rx="8" />
              <rect x={g.x} y={g.y} width={g.w} height="7" rx="3" fill={`url(#mv-as-gr-${g.id})`} />
              <circle cx={g.x + 34} cy={g.y + 34} r="16" fill={`url(#mv-as-gr-${g.id})`} />
              <text className="mv-as-esc-nome" x={g.x + 60} y={g.y + 31}>{g.nome}</text>
              <text className="mv-as-esc-st" data-ok={g.assina ? '' : undefined} x={g.x + 60} y={g.y + 50}>
                {g.assina ? 'Assina' : 'Não assina'}
              </text>
              {g.extra.map((t, i) => (
                <text key={t} className="mv-as-esc-ex" x={g.x + 18} y={g.y + 86 + i * 17}>{t}</text>
              ))}
            </g>
          ))}

          <path className="mv-as-esc-chave" d="M252,280 v6 H688 v-6" />
          <text className="mv-as-esc-pe" data-ok="" x="470" y="304" textAnchor="middle">prata e ouro: assinam as procurações</text>
          <text className="mv-as-esc-pe" x="135" y="304" textAnchor="middle">bronze: precisa subir</text>
        </svg>
      </div>

      {/* versão em pé para telas estreitas (o SVG acima some por container query) */}
      <ol className="mv-as-esc-mob" aria-label="Níveis da conta gov.br, do mais alto ao mais baixo">
        {[...DEGRAUS].reverse().map((g) => (
          <li key={g.id} data-nivel={g.id}>
            <button type="button" aria-pressed={sel === g.id} onClick={() => setSel(g.id)}>
              <Medalha n={g.id} />
              <span className="mv-as-esc-mob-tx">
                <b>{g.nome}</b>
                <small>{g.id === 'bronze' ? 'Precisa subir' : g.extra.join(' ')}</small>
              </span>
              <span className="mv-as-esc-tag" data-ok={g.assina ? '' : undefined}>
                {g.assina ? <IcCheck /> : <IcX />}{g.assina ? 'Assina' : 'Não assina'}
              </span>
            </button>
            {g.id !== 'bronze' && (
              <span className="mv-as-esc-mob-via">do bronze: {g.id === 'prata' ? 'validar com o banco' : 'reconhecimento facial'}</span>
            )}
          </li>
        ))}
      </ol>

      <div className="mv-as-esc-bts" role="group" aria-label="Ver os detalhes de cada nível">
        {DEGRAUS.map((g) => (
          <button key={g.id} type="button" aria-pressed={sel === g.id} onClick={() => setSel(g.id)}>
            <Medalha n={g.id} />{g.nome}
          </button>
        ))}
      </div>

      <div className="mv-as-esc-det" aria-live="polite">
        <div className="mv-as-esc-det-cab">
          <Medalha n={d.id} />
          <b>{d.nome}</b>
          <span className="mv-as-esc-tag" data-ok={d.assina ? '' : undefined}>
            {d.assina ? <IcCheck /> : <IcX />}{d.assina ? 'Assina as procurações' : 'Não assina'}
          </span>
        </div>
        <dl className="mv-as-dl">
          <div><dt>O que é</dt><dd>{d.oque}</dd></div>
          <div><dt>Como chegar (ou sair)</dt><dd>{d.como}</dd></div>
          <div><dt>Dica</dt><dd>{d.dica}</dd></div>
        </dl>
      </div>
      <p className="mv-as-esc-ajuda">Toque em um degrau da escada (ou nos botões) para ver os detalhes de cada nível.</p>
    </div>
  );
}

/* ===================================================================== telas genéricas (celular) */
function Fone({ children, escuro }: { children: ReactNode; escuro?: boolean }) {
  return (
    <div className="mv-as-fone">
      <div className="mv-as-fone-tela" data-escuro={escuro ? '' : undefined}>{children}</div>
    </div>
  );
}
function GTopo({ sub }: { sub?: string }) {
  return <div className="mv-as-g-topo"><b>gov.br</b>{sub && <span>{sub}</span>}</div>;
}

function TelaNivelAtual() {
  return (
    <Fone>
      <GTopo sub="Olá, Maria" />
      <div className="mv-as-g-corpo">
        <div className="mv-as-g-card">
          <small>Nível da sua conta</small>
          <span className="mv-as-g-lin"><Medalha n="bronze" /><b>Bronze</b></span>
          <small>Alguns serviços pedem prata ou ouro.</small>
        </div>
        <span className="mv-as-g-btn" data-alvo="">Aumentar nível</span>
      </div>
    </Fone>
  );
}

function TelaOpcoes({ alvo }: { alvo: 'banco' | 'facial' }) {
  const ops = [
    { id: 'banco', t: 'Validar com seu banco', s: 'leva para Prata' },
    { id: 'facial', t: 'Reconhecimento facial', s: 'leva para Ouro' },
    { id: 'cert', t: 'Certificado digital', s: 'outra opção' },
  ];
  return (
    <Fone>
      <GTopo />
      <div className="mv-as-g-corpo">
        <b className="mv-as-g-tit">Como você quer aumentar o nível?</b>
        {ops.map((o) => (
          <span key={o.id} className="mv-as-g-op" data-alvo={o.id === alvo ? '' : undefined} data-mudo={o.id === 'cert' ? '' : undefined}>
            <i aria-hidden />
            <span><b>{o.t}</b><small>{o.s}</small></span>
          </span>
        ))}
      </div>
    </Fone>
  );
}

function TelaBancos() {
  return (
    <Fone>
      <GTopo />
      <div className="mv-as-g-corpo">
        <b className="mv-as-g-tit">Escolha o seu banco</b>
        {['Banco A', 'Banco B', 'Banco C'].map((b) => (
          <span key={b} className="mv-as-g-op" data-alvo={b === 'Banco B' ? '' : undefined}>
            <i aria-hidden /><span><b>{b}</b></span>
          </span>
        ))}
        <small>O app do banco abre para confirmar. A senha do banco quem digita é o cliente.</small>
      </div>
    </Fone>
  );
}

function TelaCamera() {
  return (
    <Fone escuro>
      <div className="mv-as-g-cam">
        <small>Posicione o rosto dentro da moldura</small>
        <span className="mv-as-g-oval" aria-hidden><i /></span>
        <small>Lugar claro · sem óculos escuros · sem boné</small>
      </div>
    </Fone>
  );
}

function TelaPronto({ n }: { n: 'prata' | 'ouro' }) {
  return (
    <Fone>
      <GTopo sub="Olá, Maria" />
      <div className="mv-as-g-corpo" data-centro="">
        <span className="mv-as-g-ok" aria-hidden />
        <b className="mv-as-g-grande">Pronto!</b>
        <span className="mv-as-g-nivel"><Medalha n={n} /><b>Conta {n === 'prata' ? 'Prata' : 'Ouro'}</b></span>
        <small>Já dá para assinar documentos.</small>
      </div>
    </Fone>
  );
}

export function TelasNivel({ caminho }: { caminho: 'prata' | 'ouro' }) {
  const telas: { tela: ReactNode; leg: string }[] = caminho === 'prata'
    ? [
        { tela: <TelaNivelAtual />, leg: 'Abra o app gov.br, veja o nível da conta e toque para aumentar.' },
        { tela: <TelaOpcoes alvo="banco" />, leg: 'Escolha a opção de validar com o banco.' },
        { tela: <TelaBancos />, leg: 'Escolha o banco na lista. O cliente entra com o login do banco dele.' },
        { tela: <TelaPronto n="prata" />, leg: 'Conta prata: já pode assinar as procurações.' },
      ]
    : [
        { tela: <TelaNivelAtual />, leg: 'Abra o app gov.br, veja o nível da conta e toque para aumentar.' },
        { tela: <TelaOpcoes alvo="facial" />, leg: 'Escolha o reconhecimento facial.' },
        { tela: <TelaCamera />, leg: 'O cliente olha para a câmera e segue as instruções da tela.' },
        { tela: <TelaPronto n="ouro" />, leg: 'Conta ouro: já pode assinar as procurações.' },
      ];
  return (
    <Figura legenda={`Subir para ${caminho === 'prata' ? 'prata pelo banco' : 'ouro pela facial'}. Telas genéricas: os nomes dos botões e a aparência real do app podem mudar.`}>
      <ol className="mv-as-telas" aria-label={caminho === 'prata' ? 'Quatro telas: subir a conta gov.br para prata pelo banco' : 'Quatro telas: subir a conta gov.br para ouro pelo reconhecimento facial'}>
        {telas.map((t, i) => (
          <li key={i}>
            {t.tela}
            <p className="mv-as-telas-leg"><span className="num">{i + 1}</span>{t.leg}</p>
          </li>
        ))}
      </ol>
    </Figura>
  );
}

/* ===================================================================== fluxo da assinatura */
function TelaZap() {
  return (
    <Fone>
      <div className="mv-as-z-topo"><span className="mv-as-z-av" aria-hidden>C</span><b>CAF</b></div>
      <div className="mv-as-z-msgs">
        <div className="mv-as-z-b"><span className="mv-as-z-doc"><i aria-hidden />procuracao.pdf</span><time>10:02</time></div>
        <div className="mv-as-z-b"><p>Aqui está a procuração para a senhora assinar pelo gov.br. Vou te ajudando em cada passo.</p><time>10:02</time></div>
        <div className="mv-as-z-b" data-de="cliente"><p>Recebi! Vamos lá</p><time>10:05</time></div>
      </div>
    </Fone>
  );
}
function TelaLogin() {
  return (
    <Fone>
      <GTopo />
      <div className="mv-as-g-corpo">
        <b className="mv-as-g-tit">Assinatura de documentos</b>
        <small>Entre com a sua conta gov.br</small>
        <span className="mv-as-g-campo"><small>CPF</small><span>000.000.000-00</span></span>
        <span className="mv-as-g-campo"><small>Senha</small><span>••••••••</span></span>
        <span className="mv-as-g-btn" data-alvo="">Entrar</span>
      </div>
    </Fone>
  );
}
function TelaAssinar() {
  return (
    <Fone>
      <GTopo />
      <div className="mv-as-g-corpo">
        <b className="mv-as-g-tit">procuracao.pdf</b>
        <div className="mv-as-g-pag" aria-hidden><i /><i /><i /><i /><span>Assinatura aqui</span></div>
        <span className="mv-as-g-btn" data-alvo="">Assinar</span>
        <small>Pode pedir um código enviado ao celular para confirmar.</small>
      </div>
    </Fone>
  );
}
function TelaDevolver() {
  return (
    <Fone>
      <GTopo />
      <div className="mv-as-g-corpo" data-centro="">
        <span className="mv-as-g-ok" aria-hidden />
        <b className="mv-as-g-grande">Documento assinado!</b>
        <span className="mv-as-g-btn" data-alvo="">Baixar documento</span>
        <small>Depois, é só mandar o arquivo de volta na conversa.</small>
      </div>
    </Fone>
  );
}

const PASSOS_ASSINATURA: { t: string; sub: string; titulo: string; cliente: string; voce: string; atencao: string; tela: ReactNode }[] = [
  {
    t: 'Receber', sub: 'a procuração', titulo: 'O cliente recebe a procuração',
    cliente: 'Recebe o arquivo (PDF) das procurações geradas no cadastro. Neste exemplo, pela conversa no WhatsApp: o jeito certo de enviar, combine com o seu gestor.',
    voce: 'Antes de mandar, explique em uma frase o que é a procuração e para que ela serve. Depois mande o arquivo e diga que vai acompanhar a assinatura junto com ele.',
    atencao: 'Se for mais de um arquivo, diga quantos são. Fica mais fácil conferir quando voltarem assinados.',
    tela: <TelaZap />,
  },
  {
    t: 'Entrar', sub: 'no gov.br', titulo: 'O cliente entra no gov.br',
    cliente: 'Abre o serviço de assinatura de documentos do gov.br e entra com o CPF e a senha dele: a mesma senha do Meu INSS.',
    voce: 'Confirme antes que a conta está em prata ou ouro. Se estiver em bronze, pare aqui e suba o nível primeiro.',
    atencao: 'Se o cliente esqueceu a senha, ajude a recuperar pelo próprio gov.br, na tela de entrada. Se não der, leve ao gestor.',
    tela: <TelaLogin />,
  },
  {
    t: 'Assinar', sub: 'o documento', titulo: 'O cliente assina',
    cliente: 'Escolhe o arquivo, posiciona a assinatura no documento, toca em assinar e confirma. O gov.br pode pedir uma confirmação, como um código enviado por mensagem ao celular.',
    voce: 'Oriente com calma, um passo de cada vez, por mensagem ou por áudio. Quem assina é o cliente, com a conta dele.',
    atencao: 'Se aparecer um código de confirmação, quem digita é o cliente. Ninguém assina no lugar dele.',
    tela: <TelaAssinar />,
  },
  {
    t: 'Devolver', sub: 'o arquivo assinado', titulo: 'O cliente devolve o arquivo assinado',
    cliente: 'Baixa o documento assinado e manda de volta na conversa.',
    voce: 'Abra cada arquivo e confira: voltaram todas as procurações? A assinatura aparece em cada uma? Só depois dê o fechamento por concluído e explique os próximos passos.',
    atencao: 'Pode acontecer de o cliente reenviar o arquivo original, sem assinatura. Se acontecer, peça de novo, com paciência.',
    tela: <TelaDevolver />,
  },
];

export function FluxoAssinatura() {
  const [i, setI] = useState(0);
  const p = PASSOS_ASSINATURA[i];
  const ultimo = PASSOS_ASSINATURA.length - 1;
  return (
    <div className="vidro mv-as-flx">
      <ol className="mv-as-flx-trilha" aria-label="Os quatro passos da assinatura">
        {PASSOS_ASSINATURA.map((s, k) => (
          <li key={s.t} data-estado={k < i ? 'feito' : k === i ? 'atual' : undefined}>
            <button type="button" onClick={() => setI(k)} aria-current={k === i ? 'step' : undefined}>
              <span className="mv-as-flx-n num">{k < i ? <IcCheck /> : k + 1}</span>
              <span className="mv-as-flx-tx"><b>{s.t}</b><small>{s.sub}</small></span>
            </button>
          </li>
        ))}
      </ol>
      <div className="mv-as-flx-corpo">
        <div className="mv-as-flx-tela">{p.tela}</div>
        <div className="mv-as-flx-info" aria-live="polite">
          <small className="mv-as-flx-cont">Passo {i + 1} de {PASSOS_ASSINATURA.length}</small>
          <h4>{p.titulo}</h4>
          <dl>
            <div data-quem="cliente"><dt>O cliente</dt><dd>{p.cliente}</dd></div>
            <div data-quem="voce"><dt>Você</dt><dd>{p.voce}</dd></div>
            <div data-quem="atencao"><dt>Atenção</dt><dd>{p.atencao}</dd></div>
          </dl>
          <div className="mv-as-flx-nav">
            <button type="button" className="mv-as-bt" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>Anterior</button>
            <button type="button" className="mv-as-bt" data-primario="" onClick={() => setI(Math.min(ultimo, i + 1))} disabled={i === ultimo}>Próximo passo</button>
          </div>
        </div>
      </div>
      <p className="mv-as-flx-pe"><span className="mv-tag">Ilustração</span>Telas genéricas: a aparência real do gov.br e do WhatsApp pode mudar.</p>
    </div>
  );
}

/* ===================================================================== diagnóstico: consegue assinar? */
type NoId = 'nivel' | 'descobrir' | 'banco' | 'facial' | 'pode' | 'prata' | 'ouro' | 'gestor';
type No =
  | { tipo: 'pergunta'; curto: string; titulo: string; ajuda?: string; opcoes: { r: string; vai: NoId }[] }
  | { tipo: 'fim'; tom: 'verde' | 'azul' | 'ambar'; titulo: string; texto: ReactNode; volta?: string };
const NOS: Record<NoId, No> = {
  nivel: {
    tipo: 'pergunta', curto: 'Nível', titulo: 'Em que nível está a conta gov.br do cliente?',
    ajuda: 'O nível aparece no aplicativo gov.br, na área da conta.',
    opcoes: [{ r: 'Bronze', vai: 'banco' }, { r: 'Prata', vai: 'pode' }, { r: 'Ouro', vai: 'pode' }, { r: 'Não sei', vai: 'descobrir' }],
  },
  descobrir: {
    tipo: 'fim', tom: 'azul', titulo: 'Primeiro, descubra o nível',
    texto: 'Peça para o cliente abrir o aplicativo gov.br: o nível da conta (bronze, prata ou ouro) aparece na área da conta. Se ficar mais fácil para ele, peça um print da tela. Com o nível em mãos, recomece o diagnóstico.',
    volta: 'Já sei o nível',
  },
  banco: {
    tipo: 'pergunta', curto: 'Banco', titulo: 'O cliente consegue entrar no aplicativo (ou no site) de um banco onde tem conta?',
    ajuda: 'É o login do banco: o mesmo que ele usa para ver o saldo no celular.',
    opcoes: [{ r: 'Sim, usa o app do banco', vai: 'prata' }, { r: 'Não tem ou não lembra a senha', vai: 'facial' }],
  },
  facial: {
    tipo: 'pergunta', curto: 'Facial', titulo: 'O cliente consegue fazer o reconhecimento facial no app gov.br?',
    ajuda: 'Precisa de um celular com câmera, e o governo precisa ter uma foto dele cadastrada para comparar.',
    opcoes: [{ r: 'Sim, vamos tentar', vai: 'ouro' }, { r: 'Já tentou e não deu certo', vai: 'gestor' }, { r: 'Não tem celular com câmera', vai: 'gestor' }],
  },
  pode: {
    tipo: 'fim', tom: 'verde', titulo: 'Pode assinar',
    texto: 'Prata e ouro assinam as procurações. Siga para o fluxo da assinatura: mande o arquivo e acompanhe o cliente nos quatro passos.',
  },
  prata: {
    tipo: 'fim', tom: 'azul', titulo: 'Caminho: subir para prata pelo banco',
    texto: (<>No app gov.br: aumentar o nível → validar com banco → escolher o banco na lista → entrar com o login do banco. <b>A senha do banco é só do cliente: você nunca pede.</b> Se o banco dele não estiver na lista, tente a facial.</>),
  },
  ouro: {
    tipo: 'fim', tom: 'azul', titulo: 'Caminho: subir para ouro pela facial',
    texto: (<>No app gov.br: aumentar o nível → reconhecimento facial → seguir as instruções da câmera. Lugar bem claro, sem óculos escuros nem boné, celular parado na altura do rosto. Um familiar pode ajudar a segurar o celular, mas <b>o rosto tem que ser o do cliente</b>. Se não passar depois de algumas tentativas, leve ao gestor.</>),
  },
  gestor: {
    tipo: 'fim', tom: 'ambar', titulo: 'Leve ao gestor',
    texto: (<>Sem atalhos: ninguém assina pelo cliente nem usa a conta de outra pessoa. Anote o que já foi tentado (nível da conta, banco, facial) e passe o caso para o seu gestor, que orienta o próximo passo. Para o cliente, diga com calma que você vai verificar e já retorna.</>),
  },
};

export function DiagnosticoAssinatura() {
  const [atual, setAtual] = useState<NoId>('nivel');
  const [trilha, setTrilha] = useState<{ p: string; r: string }[]>([]);
  const no = NOS[atual];
  function responder(curto: string, r: string, vai: NoId) {
    setTrilha((t) => [...t, { p: curto, r }]);
    setAtual(vai);
  }
  function recomecar() {
    setTrilha([]);
    setAtual('nivel');
  }
  return (
    <div className="vidro mv-as-dg">
      <div className="mv-as-dg-cab">
        <span className="mv-as-dg-tag">Diagnóstico</span>
        <b>O cliente consegue assinar?</b>
        {trilha.length > 0 && <button type="button" className="mv-link" onClick={recomecar}>Recomeçar</button>}
      </div>
      {trilha.length > 0 && (
        <ol className="mv-as-dg-trilha" aria-label="Respostas até aqui">
          {trilha.map((t, k) => <li key={k}><small>{t.p}:</small><b>{t.r}</b></li>)}
        </ol>
      )}
      {no.tipo === 'pergunta' ? (
        <div className="mv-as-dg-no" aria-live="polite">
          <p className="mv-as-dg-p">{no.titulo}</p>
          {no.ajuda && <p className="mv-as-dg-ajuda">{no.ajuda}</p>}
          <div className="mv-as-dg-ops">
            {no.opcoes.map((o) => (
              <button key={o.r} type="button" onClick={() => responder(no.curto, o.r, o.vai)}>{o.r}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mv-as-dg-fim" data-tom={no.tom} aria-live="polite">
          <b>{no.titulo}</b>
          <p>{no.texto}</p>
          <div className="mv-as-dg-ops">
            <button type="button" onClick={recomecar}>{no.volta ?? 'Testar outro caso'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===================================================================== linha do tempo depois da assinatura */
export function LinhaTempoPos() {
  const X0 = 170, X12 = 620;
  const mes = (m: number) => X0 + ((X12 - X0) / 12) * m;
  const Y = 68;
  return (
    <Figura legenda="Depois da assinatura. Os prazos são médias: cada processo anda no seu ritmo, e o valor depende do resultado.">
      <div className="mv-as-lt-caixa">
      {/* versão em pé para telas estreitas (o SVG some por container query) */}
      <ol className="mv-as-lt-mob" aria-label="Linha do tempo depois da assinatura">
        <li><small>Hoje</small><b>Assinatura do cliente</b></li>
        <li><small>Início</small><b>O advogado entra com a ação</b></li>
        <li data-janela=""><small>Em média, 6 a 12 meses</small><b>Até o final do processo</b></li>
        <li data-tom="verde"><small>Final</small><b>30% de honorários, do valor recebido</b></li>
        <li data-nota="gratis">O cliente não paga nada durante o processo</li>
        <li data-nota="voce">Você: mantém o contato, tira dúvidas e não promete valor nem data</li>
      </ol>
      <div className="mv-as-rolar">
        <svg className="mv-as-svg mv-as-lt" viewBox="0 0 720 190" role="img"
          aria-label="Linha do tempo depois da assinatura: hoje o cliente assina; depois o advogado entra com a ação; em média, o processo leva de 6 a 12 meses; o cliente não paga nada durante o processo; os 30% de honorários saem no final, do valor recebido; você mantém o contato o tempo todo.">
          <line className="mv-as-lt-eixo" x1="40" y1={Y} x2="704" y2={Y} />
          <rect className="mv-as-lt-faixa" x={X0} y={Y - 8} width={X12 - X0} height="16" rx="8" />
          <rect className="mv-as-lt-janela" x={mes(6)} y={Y - 8} width={mes(12) - mes(6)} height="16" rx="8" />

          {/* marcos */}
          <circle className="mv-as-lt-ponto" cx="70" cy={Y} r="8" />
          <text className="mv-as-lt-tit" x="70" y="24" textAnchor="middle">Assinatura</text>
          <text className="mv-as-lt-sub" x="70" y="41" textAnchor="middle">do cliente</text>

          <circle className="mv-as-lt-ponto" cx={X0} cy={Y} r="8" />
          <text className="mv-as-lt-tit" x={X0} y="24" textAnchor="middle">Ação</text>
          <text className="mv-as-lt-sub" x={X0} y="41" textAnchor="middle">o advogado entra</text>

          <text className="mv-as-lt-tit" x={mes(9)} y="24" textAnchor="middle">Em média, 6 a 12 meses</text>
          <text className="mv-as-lt-sub" x={mes(9)} y="41" textAnchor="middle">até o final do processo</text>

          <circle className="mv-as-lt-ponto" data-tom="verde" cx="680" cy={Y} r="8" />
          <text className="mv-as-lt-tit" x="680" y="24" textAnchor="middle">Final</text>
          <text className="mv-as-lt-sub" x="680" y="41" textAnchor="middle">do processo</text>

          {/* régua */}
          <line className="mv-as-lt-tick" x1={mes(6)} y1={Y + 9} x2={mes(6)} y2={Y + 15} />
          <line className="mv-as-lt-tick" x1={mes(12)} y1={Y + 9} x2={mes(12)} y2={Y + 15} />
          <text className="mv-as-lt-q" x="70" y="96" textAnchor="middle">hoje</text>
          <text className="mv-as-lt-q" x={X0} y="96" textAnchor="middle">início</text>
          <text className="mv-as-lt-q" x={mes(6)} y="96" textAnchor="middle">6 meses</text>
          <text className="mv-as-lt-q" x={mes(12)} y="96" textAnchor="middle">12 meses</text>

          {/* dinheiro */}
          <rect className="mv-as-lt-gratis" x="40" y="116" width="570" height="28" rx="6" />
          <text className="mv-as-lt-gratis-tx" x="325" y="134" textAnchor="middle">O cliente não paga nada durante o processo</text>
          <rect className="mv-as-lt-hon" x="618" y="116" width="94" height="28" rx="6" />
          <text className="mv-as-lt-hon-tx" x="665" y="134" textAnchor="middle">30% no final</text>

          {/* você */}
          <rect className="mv-as-lt-voce" x="40" y="154" width="672" height="28" rx="6" />
          <text className="mv-as-lt-voce-tx" x="376" y="172" textAnchor="middle">Você: mantém o contato, tira dúvidas e não promete valor nem data</text>
        </svg>
      </div>
      </div>
    </Figura>
  );
}

/* ===================================================================== checklist de fechamento */
const CHECK: { t: string; itens: string[] }[] = [
  {
    t: 'Documentação completa',
    itens: [
      'Carta de concessão',
      'Extrato de empréstimo consignado',
      'Extratos de pagamento: os 10 períodos (10 anos)',
      'Imposto de renda: print dos últimos 3 anos (e DEC e REC, se o cliente declara)',
      'Situação cadastral do CPF',
      'RG ou CNH (frente e verso)',
      'Foto do rosto',
      'Comprovante de residência do mês atual ou do mês passado',
      'Comprovante de outra pessoa? Identidade dela e a declaração',
      'E-mail do cliente',
    ],
  },
  {
    t: 'Cadastro e procurações',
    itens: [
      'Dados conferidos: nome completo, CPF, endereço e e-mail',
      'Cliente cadastrado no admin',
      'Procurações geradas pelo sistema',
      'Procurações enviadas ao cliente, com explicação do que são',
    ],
  },
  {
    t: 'Assinatura',
    itens: [
      'Conta gov.br em prata ou ouro',
      'Procurações assinadas pelo próprio cliente, no gov.br',
      'Arquivos assinados recebidos e conferidos, um por um',
    ],
  },
  {
    t: 'Depois de assinar',
    itens: [
      'Próximos passos explicados: a ação (juros do empréstimo pessoal), 6 a 12 meses em média, 30% só no final',
      'Cliente avisado: nenhum pagamento é feito antes',
      'Senha do gov.br trocada, se o cliente tinha passado a senha para você',
      'Canal aberto: o cliente sabe que pode te chamar',
    ],
  },
];
const TOTAL_CHECK = CHECK.reduce((s, g) => s + g.itens.length, 0);

export function ChecklistFechamento() {
  const [feitos, setFeitos] = useState<Set<string>>(() => new Set());
  const n = feitos.size;
  const completo = n === TOTAL_CHECK;
  function alternar(id: string) {
    setFeitos((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }
  return (
    <div className="mv-as-ck" data-completo={completo ? '' : undefined}>
      <div className="vidro mv-as-ck-topo">
        <div className="mv-as-ck-prog">
          <span className="num">{n} de {TOTAL_CHECK} itens</span>
          <div className="mv-as-ck-barra" aria-hidden><i style={{ width: `${(n / TOTAL_CHECK) * 100}%` }} /></div>
        </div>
        {completo
          ? <span className="mv-as-ck-fim" role="status"><IcCheck />Fechamento completo. Agora é com o advogado.</span>
          : <span className="mv-as-ck-dica">Marque cada item ao concluir. Use com um cliente de verdade.</span>}
        {n > 0 && <button type="button" className="mv-link" onClick={() => setFeitos(new Set())}>Limpar</button>}
      </div>
      <div className="mv-as-ck-grade">
        {CHECK.map((g, gi) => {
          const feitosGrupo = g.itens.filter((_, ii) => feitos.has(`${gi}-${ii}`)).length;
          return (
            <div key={g.t} className="vidro mv-as-ck-grupo">
              <h4><span>{gi + 1}. {g.t}</span><small className="num">{feitosGrupo}/{g.itens.length}</small></h4>
              {g.itens.map((it, ii) => {
                const id = `${gi}-${ii}`;
                const marcado = feitos.has(id);
                return (
                  <button key={id} type="button" className="mv-as-ck-it" aria-pressed={marcado} onClick={() => alternar(id)}>
                    <span className="mv-as-ck-box" aria-hidden>{marcado && <IcCheck />}</span>
                    <span>{it}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
