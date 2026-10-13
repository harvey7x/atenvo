/* Lição 04 — ilustrações próprias (SVG e HTML+CSS): as 3 portas, o público em
   anéis, os tipos de benefício, as 5 financeiras, o extrato ilustrado, a rota do
   familiar, a persona, os pensamentos do cliente e as seis atitudes.
   Cores só por classes com tokens (arquivo 04-cliente.css). */
import type { ReactNode } from 'react';
import { IcCheck, IcX, Print } from '../pecas';

/* ===================================================================== moldura que rola */
/** SVG largo: em tela estreita rola de lado dentro da moldura, com um aviso discreto. */
export function Rolar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mv-cli-rolar">{children}</div>
      <p className="mv-cli-rolar-dica" aria-hidden>Figura larga: arraste para o lado para ver tudo.</p>
    </>
  );
}

/* ===================================================================== as 3 portas */
type IconeTipo = 'inss' | 'familia' | 'banco';
function IconePorta({ tipo, cx, cy }: { tipo: IconeTipo; cx: number; cy: number }) {
  if (tipo === 'inss') {
    return (
      <g>
        <rect className="mv-cli-ic" x={cx - 28} y={cy - 18} width="56" height="36" rx="5" />
        <text className="mv-cli-ic-t" x={cx} y={cy + 5} textAnchor="middle">INSS</text>
      </g>
    );
  }
  if (tipo === 'familia') {
    return (
      <g>
        <circle className="mv-cli-ic" cx={cx - 10} cy={cy - 9} r="7" />
        <path className="mv-cli-ic" d={`M${cx - 25},${cy + 18} Q${cx - 10},${cy - 4} ${cx + 5},${cy + 18}`} />
        <circle className="mv-cli-ic" cx={cx + 15} cy={cy - 3} r="5.5" />
        <path className="mv-cli-ic" d={`M${cx + 5},${cy + 18} Q${cx + 15},${cy + 2} ${cx + 26},${cy + 18}`} />
      </g>
    );
  }
  return (
    <g>
      <path className="mv-cli-ic" d={`M${cx - 27},${cy - 7} L${cx},${cy - 21} L${cx + 27},${cy - 7} Z`} />
      {[-17, -6, 6, 17].map((dx) => <line key={dx} className="mv-cli-ic" x1={cx + dx} y1={cy - 3} x2={cx + dx} y2={cy + 13} />)}
      <line className="mv-cli-ic" x1={cx - 28} y1={cy + 18} x2={cx + 28} y2={cy + 18} />
    </g>
  );
}

const PORTAS: { x: number; n: string; t1: string; t2: string; tom: 'azul' | 'verde'; ic: IconeTipo }[] = [
  { x: 30, n: '1', t1: 'Benefício do INSS', t2: 'da própria pessoa', tom: 'azul', ic: 'inss' },
  { x: 250, n: '2', t1: 'Familiar recebe', t2: 'pai, mãe, avó, avô ou filho', tom: 'azul', ic: 'familia' },
  { x: 560, n: '3', t1: 'Tem empréstimo', t2: 'numa das 5 financeiras', tom: 'verde', ic: 'banco' },
];

/** As três portas: (1 OU 2) E 3. */
export function TresPortas() {
  const y0 = 60, w = 170, h = 170;
  return (
    <Rolar>
      <svg className="mv-cli-svg" viewBox="0 0 760 292" role="img"
        aria-label="Três portas. Porta 1: benefício do INSS da própria pessoa. Porta 2: um familiar recebe do INSS. A pessoa precisa passar pela porta 1 ou pela porta 2, e também pela porta 3: empréstimo numa das 5 financeiras.">
        <path className="mv-cli-chave" d="M30,46 V34 H420 V46" />
        <text className="mv-cli-rot" x="225" y="24" textAnchor="middle">Precisa passar por uma destas duas</text>
        <path className="mv-cli-chave" d="M560,46 V34 H730 V46" />
        <text className="mv-cli-rot" x="645" y="24" textAnchor="middle">E também por esta</text>
        <line className="mv-cli-chao" x1="10" y1={y0 + h} x2="750" y2={y0 + h} />
        {PORTAS.map((p) => {
          const cx = p.x + w / 2;
          return (
            <g key={p.n} className="mv-cli-porta" data-tom={p.tom}>
              <rect className="mv-cli-moldura" x={p.x} y={y0} width={w} height={h} rx="10" />
              <rect className="mv-cli-folha" x={p.x + 16} y={y0 + 14} width={w - 32} height={h - 14} rx="6" />
              <rect className="mv-cli-almofada" x={p.x + 30} y={y0 + 28} width={w - 60} height="58" rx="5" />
              <rect className="mv-cli-almofada" x={p.x + 30} y={y0 + 100} width={w - 60} height="56" rx="5" />
              <circle className="mv-cli-macaneta" cx={p.x + w - 36} cy={y0 + 93} r="5" />
              <IconePorta tipo={p.ic} cx={cx} cy={y0 + 57} />
              <circle className="mv-cli-selo" cx={cx} cy={y0} r="16" />
              <text className="mv-cli-selo-t" x={cx} y={y0 + 5} textAnchor="middle">{p.n}</text>
              <text className="mv-cli-t1" x={cx} y="258" textAnchor="middle">{p.t1}</text>
              <text className="mv-cli-t2" x={cx} y="278" textAnchor="middle">{p.t2}</text>
            </g>
          );
        })}
        <circle className="mv-cli-con" cx="225" cy="145" r="17" />
        <text className="mv-cli-con-t" x="225" y="150" textAnchor="middle">ou</text>
        <circle className="mv-cli-con" data-forte="" cx="490" cy="145" r="20" />
        <text className="mv-cli-con-t" x="490" y="150" textAnchor="middle">e</text>
      </svg>
    </Rolar>
  );
}

/* ===================================================================== público em anéis */
/** Do centro para fora: público principal, quem também serve e a rota do familiar. */
export function PublicoAlvo() {
  const cx = 160, cy = 158;
  const rotulos = [
    { y: 46, px: 210, py: 128, t: 'O público principal', s: ['Aposentados e pensionistas do INSS.', 'É com eles que o anúncio fala.'] },
    { y: 140, px: 240, py: 158, t: 'Também servem', s: ['Quem recebe auxílio ou BPC/LOAS:', 'qualquer benefício do INSS abre a porta 1.'] },
    { y: 234, px: 264, py: 218, t: 'Pela rota do familiar', s: ['Não recebe, mas pai, mãe, avó, avô ou', 'filho recebe do INSS (porta 2).'] },
  ];
  return (
    <Rolar>
      <svg className="mv-cli-svg" viewBox="0 0 760 316" role="img"
        aria-label="Três anéis. No centro, o público principal: aposentados e pensionistas do INSS. No anel do meio, quem recebe auxílio ou BPC/LOAS. No anel de fora, a rota do familiar. Em todos os casos, é preciso ter empréstimo numa das 5 financeiras.">
        <circle className="mv-cli-anel" data-n="3" cx={cx} cy={cy} r="142" />
        <circle className="mv-cli-anel" data-n="2" cx={cx} cy={cy} r="100" />
        <circle className="mv-cli-anel" data-n="1" cx={cx} cy={cy} r="58" />
        <text className="mv-cli-anel-t" x={cx} y={cy - 3} textAnchor="middle">Aposentados</text>
        <text className="mv-cli-anel-t" x={cx} y={cy + 15} textAnchor="middle">e pensionistas</text>
        <text className="mv-cli-anel-s" x={cx} y={cy - 67} textAnchor="middle">auxílio · BPC/LOAS</text>
        <text className="mv-cli-anel-s" x={cx} y={cy - 116} textAnchor="middle">rota do familiar</text>
        {rotulos.map((r) => (
          <g key={r.t}>
            <path className="mv-cli-guia" d={`M${r.px},${r.py} L320,${r.y - 5} L338,${r.y - 5}`} />
            <circle className="mv-cli-guia-ponto" cx={r.px} cy={r.py} r="3.5" />
            <text className="mv-cli-lb-t" x="346" y={r.y}>{r.t}</text>
            {r.s.map((l, i) => <text key={l} className="mv-cli-lb-s" x="346" y={r.y + 20 + i * 18}>{l}</text>)}
          </g>
        ))}
        <text className="mv-cli-nota" x="346" y="306">Sempre: empréstimo numa das 5 financeiras (porta 3).</text>
      </svg>
    </Rolar>
  );
}

/* ===================================================================== tipos de benefício */
const IcRelogio = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
const IcCoracao = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0112 7.6a4.1 4.1 0 017.5 2.3c0 5.2-7.5 9.6-7.5 9.6z" /></svg>
);
const IcCruz = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z" /></svg>
);
const IcMao = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="7" r="3.2" /><path d="M3.5 15.5l3.2-1.8a3 3 0 012.4-.2l4.4 1.4a1.5 1.5 0 01-.8 2.9l-3.2-.6M3.5 20h9.2l7-4.2a1.7 1.7 0 00-1.9-2.8L14 15" /></svg>
);

const BENEFICIOS: { ic: ReactNode; nome: string; sub: string; oque: string; falas: string[] }[] = [
  {
    ic: <IcRelogio />, nome: 'Aposentadoria', sub: 'o público do nosso anúncio',
    oque: 'O pagamento mensal de quem se aposentou pelo INSS: por idade, por tempo de contribuição ou por incapacidade.',
    falas: ['"Sou aposentado."', '"Me aposentei por idade."'],
  },
  {
    ic: <IcCoracao />, nome: 'Pensão por morte', sub: 'quem recebe é o pensionista',
    oque: 'Paga pelo INSS à família (marido, esposa, filhos e outros dependentes) de quem contribuía ou era aposentado e faleceu.',
    falas: ['"Sou pensionista."', '"Recebo a pensão do meu marido."'],
  },
  {
    ic: <IcCruz />, nome: 'Auxílio', sub: 'doença, acidente e outros',
    oque: 'Pago pelo INSS em situações específicas, como doença ou acidente que impedem de trabalhar. Muitas vezes é temporário.',
    falas: ['"Estou encostado."', '"Recebo auxílio-doença."'],
  },
  {
    ic: <IcMao />, nome: 'BPC/LOAS', sub: 'Benefício de Prestação Continuada',
    oque: 'Um salário mínimo por mês, pago pelo INSS a idosos de 65 anos ou mais e a pessoas com deficiência, de família de baixa renda. Não é aposentadoria: não exige contribuição.',
    falas: ['"Recebo o LOAS."', '"Recebo o benefício do idoso."'],
  },
];

/** Os quatro tipos de benefício do INSS, cada um com o "jeito de falar" do cliente. */
export function TiposBeneficio() {
  return (
    <div className="mv-cli-ben">
      {BENEFICIOS.map((b) => (
        <div key={b.nome} className="vidro mv-cli-ben-it">
          <div className="mv-cli-ben-cab">
            <span className="mv-cli-ben-ic">{b.ic}</span>
            <div><b>{b.nome}</b><small>{b.sub}</small></div>
            <span className="mv-cli-selo-ok"><IcCheck />Serve</span>
          </div>
          <p>{b.oque}</p>
          <div className="mv-cli-falas" aria-label="Como o cliente costuma falar">
            {b.falas.map((f) => <span key={f}>{f}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

const NAO_INSS: { t: string; s: string }[] = [
  { t: 'Salário de carteira assinada (CLT)', s: 'É salário pago pela empresa, não benefício.' },
  { t: 'Aposentadoria por regime próprio', s: 'Muitos servidores do Estado, da prefeitura ou da União se aposentam por um regime que não é o INSS.' },
  { t: 'Pensão alimentícia', s: 'Paga por uma pessoa (ex-cônjuge, pai), não pelo INSS.' },
  { t: 'Bolsa Família', s: 'É um programa do governo federal, não um benefício do INSS.' },
];
/** Faixa de alerta: o que parece benefício, mas não é do INSS. */
export function NaoEInss() {
  return (
    <div className="vidro mv-cli-nao">
      <b>Atenção: estes NÃO são benefícios do INSS</b>
      <div className="mv-cli-nao-grade">
        {NAO_INSS.map((n) => (
          <div key={n.t} className="mv-cli-nao-it">
            <span aria-hidden><IcX /></span>
            <span>{n.t}<small>{n.s}</small></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===================================================================== as 5 financeiras */
const FINANCEIRAS: { nome: string; mono: string; top: boolean }[] = [
  { nome: 'Agibank', mono: 'AG', top: true },
  { nome: 'Mercantil', mono: 'ME', top: true },
  { nome: 'BMG', mono: 'BM', top: true },
  { nome: 'Facta', mono: 'FA', top: false },
  { nome: 'Crefisa', mono: 'CR', top: false },
];
/** As 5 financeiras (monogramas genéricos, sem logotipo), com destaque às top 3. */
export function Financeiras() {
  return (
    <div className="mv-cli-fin" role="list" aria-label="As 5 financeiras com que trabalhamos">
      {FINANCEIRAS.map((f) => (
        <div key={f.nome} role="listitem" className="vidro mv-cli-fin-it" data-top={f.top ? '' : undefined}>
          <span className="mv-cli-fin-mono" aria-hidden>{f.mono}</span>
          <b>{f.nome}</b>
          <span className="mv-cli-fin-tag">{f.top ? 'Top 3 · das que mais chegam' : 'Também na lista'}</span>
        </div>
      ))}
    </div>
  );
}

/** Extrato de empréstimos ilustrado: achar o NOME do banco em cada linha. */
export function ExtratoIlustrado() {
  const linhas = [
    { banco: 'AGIBANK', contrato: '•••• 4821', ok: true },
    { banco: 'BANCO EXEMPLO S.A.', contrato: '•••• 0937', ok: false },
    { banco: 'BMG', contrato: '•••• 1560', ok: true },
  ];
  return (
    <Print endereco="meu.inss.gov.br › extrato de empréstimo consignado"
      legenda="Exemplo simplificado: o documento real tem outro visual e mais colunas. O que importa aqui é o nome do banco de cada empréstimo.">
      <div className="mvp-app">
        <div className="mvp-topo"><b>Extrato de Empréstimo Consignado</b><span>Exemplo</span></div>
        <div className="mv-cli-ext">
          <div className="mv-cli-ext-cab"><span>Banco</span><span>Contrato</span><span>Está entre as 5?</span></div>
          {linhas.map((l) => (
            <div key={l.banco} className="mv-cli-ext-lin">
              <b>{l.banco}</b>
              <span className="num">{l.contrato}</span>
              <span className="mv-cli-ext-v" data-ok={l.ok ? '' : undefined}>{l.ok ? 'Sim, na lista' : 'Fora da lista'}</span>
            </div>
          ))}
        </div>
      </div>
    </Print>
  );
}

/* ===================================================================== pessoas desenhadas */
/** Pessoa em traço simples. `idosa` acrescenta coque e óculos. */
function Pessoa({ cx, cy, idosa, tom, fone }: { cx: number; cy: number; idosa?: boolean; tom?: 'verde'; fone?: boolean }) {
  return (
    <g>
      <rect className="mv-cli-pele" x={cx - 8} y={cy + 27} width="16" height="27" rx="4" />
      <path className="mv-cli-roupa" data-tom={tom} d={`M${cx - 52},${cy + 100} C${cx - 52},${cy + 26} ${cx + 52},${cy + 26} ${cx + 52},${cy + 100} Z`} />
      <circle className="mv-cli-pele" cx={cx} cy={cy} r="28" />
      {idosa ? (
        <>
          <circle className="mv-cli-cabelo" cx={cx} cy={cy - 33} r="10" />
          <path className="mv-cli-cabelo" d={`M${cx - 28},${cy - 2} C${cx - 28},${cy - 34} ${cx + 28},${cy - 34} ${cx + 28},${cy - 2} C${cx + 20},${cy - 18} ${cx - 20},${cy - 18} ${cx - 28},${cy - 2} Z`} />
          <circle className="mv-cli-traco" cx={cx - 10} cy={cy + 2} r="7" />
          <circle className="mv-cli-traco" cx={cx + 10} cy={cy + 2} r="7" />
          <line className="mv-cli-traco" x1={cx - 3} y1={cy + 2} x2={cx + 3} y2={cy + 2} />
        </>
      ) : (
        <>
          <path className="mv-cli-cabelo" d={`M${cx - 28},${cy - 4} C${cx - 26},${cy - 36} ${cx + 26},${cy - 36} ${cx + 28},${cy - 4} C${cx + 14},${cy - 16} ${cx - 14},${cy - 16} ${cx - 28},${cy - 4} Z`} />
          <circle className="mv-cli-guia-ponto" cx={cx - 9} cy={cy + 2} r="2.2" />
          <circle className="mv-cli-guia-ponto" cx={cx + 9} cy={cy + 2} r="2.2" />
        </>
      )}
      <path className="mv-cli-traco" d={`M${cx - 8},${cy + 15} Q${cx},${cy + 20} ${cx + 8},${cy + 15}`} />
      {fone && (
        <>
          <rect className="mv-cli-fone" x={cx + 14} y={cy + 52} width="22" height="38" rx="5" />
          <rect className="mv-cli-fone-tela" x={cx + 17} y={cy + 57} width="16" height="26" rx="2" />
        </>
      )}
    </g>
  );
}

/* ===================================================================== rota do familiar */
const DOCS_FAMILIAR = [
  'Meu INSS: carta e extratos',
  'Imposto de renda e situação do CPF',
  'Identidade e foto do rosto',
  'Comprovante de residência e e-mail',
];
/** Quem conversa × de quem são a análise e os documentos. */
export function FamiliarDocs() {
  return (
    <Rolar>
      <svg className="mv-cli-svg" viewBox="0 0 760 262" role="img"
        aria-label="Na rota do familiar, quem conversa pode ser o filho, que ajuda. A análise e os documentos são todos do familiar titular do benefício: carta e extratos do Meu INSS, imposto de renda e situação do CPF, identidade e foto do rosto, comprovante de residência e e-mail.">
        <Pessoa cx={100} cy={62} fone />
        <text className="mv-cli-t1" x="100" y="212" textAnchor="middle">Quem conversa</text>
        <text className="mv-cli-t2" x="100" y="232" textAnchor="middle">filho, filha ou neto: ajuda</text>
        <path className="mv-cli-seta" d="M160,120 H258" />
        <polygon className="mv-cli-seta-ponta" points="268,120 258,114.5 258,125.5" />
        <text className="mv-cli-seta-t" x="213" y="108" textAnchor="middle">ajuda na conversa</text>

        <Pessoa cx={334} cy={62} idosa tom="verde" />
        <text className="mv-cli-t1" x="334" y="212" textAnchor="middle">Titular do benefício</text>
        <text className="mv-cli-t2" x="334" y="232" textAnchor="middle">o familiar que recebe do INSS</text>
        <path className="mv-cli-seta" data-tom="verde" d="M400,120 H424" />
        <polygon className="mv-cli-seta-ponta" data-tom="verde" points="434,120 424,114.5 424,125.5" />

        <text className="mv-cli-rot" x="594" y="22" textAnchor="middle">Análise e documentos: tudo do titular</text>
        {DOCS_FAMILIAR.map((d, i) => {
          const y = 36 + i * 44;
          return (
            <g key={d}>
              <rect className="mv-cli-doc" x="440" y={y} width="308" height="36" rx="8" />
              <path className="mv-cli-doc-ic" d={`M454,${y + 8} h12 l5,5 v15 h-17 z`} />
              <text className="mv-cli-doc-t" x="482" y={y + 23}>{d}</text>
            </g>
          );
        })}
        <text className="mv-cli-t2" x="594" y="232" textAnchor="middle">Na dúvida sobre algum, pergunte ao gestor.</text>
      </svg>
    </Rolar>
  );
}

/* ===================================================================== persona */
const IcCartao = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M7 10h6M7 14h4" strokeLinecap="round" /></svg>
);
const IcCelular = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="6.5" y="2.8" width="11" height="18.4" rx="2.4" /><path d="M10.5 17.6h3" strokeLinecap="round" /></svg>
);
const IcEscudo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" /><path d="M12 8.5v4M12 15.6v.01" strokeLinecap="round" /></svg>
);
const IcFamilia = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="8.5" cy="7.5" r="3" /><circle cx="17" cy="9.5" r="2.4" /><path d="M2.8 19.5c.6-3.6 3-5.5 5.7-5.5s5.1 1.9 5.7 5.5M14.6 15.2c.7-.5 1.5-.8 2.4-.8 2.1 0 3.8 1.5 4.2 4.6" /></svg>
);
const IcAmpulheta = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M6.5 3h11M6.5 21h11M7.5 3c0 4.5 4.5 6 4.5 9s-4.5 4.5-4.5 9M16.5 3c0 4.5-4.5 6-4.5 9s4.5 4.5 4.5 9" /></svg>
);
const TRACOS: { ic: ReactNode; t: string; d: string }[] = [
  { ic: <IcCartao />, t: 'Recebe do INSS', d: 'Aposentada ou pensionista: é para ela que o anúncio fala.' },
  { ic: <IcCelular />, t: 'Celular no básico', d: 'Usa WhatsApp e manda áudio. Aplicativo, link e PDF já complicam.' },
  { ic: <IcEscudo />, t: 'Desconfiada', d: 'Já ouviu falar de golpe com aposentado. Uma mensagem estranha e ela some.' },
  { ic: <IcFamilia />, t: 'Conta com a família', d: 'Filho, filha ou neto ajudam no celular e nas decisões.' },
  { ic: <IcAmpulheta />, t: 'Tem o tempo dela', d: 'Responde quando pode. Às vezes some por horas e volta depois.' },
];
/** Ficha da persona (personagem de exemplo) com avatar desenhado. */
export function Persona() {
  return (
    <div className="vidro mv-cli-per">
      <div className="mv-cli-per-av">
        <svg viewBox="0 0 160 160" role="img" aria-label="Desenho de uma senhora de óculos segurando o celular">
          <defs><clipPath id="mv-cli-av-recorte"><circle cx="80" cy="80" r="78" /></clipPath></defs>
          <circle className="mv-cli-av-fundo" cx="80" cy="80" r="78" />
          <g clipPath="url(#mv-cli-av-recorte)"><Pessoa cx={80} cy={64} idosa fone /></g>
        </svg>
        <div><b>Dona Zilda, 68 anos</b><small>personagem de exemplo</small></div>
      </div>
      <div className="mv-cli-per-tx">
        <ul className="mv-cli-per-tr">
          {TRACOS.map((t) => (
            <li key={t.t}>
              <span className="mv-cli-per-ic">{t.ic}</span>
              <div><b>{t.t}</b><span>{t.d}</span></div>
            </li>
          ))}
        </ul>
        <div className="mv-cli-per-pe">
          <div className="mv-cli-per-col" data-tom="verde">
            <b>O que ela quer</b>
            <ul>
              <li>Entender, sem pressa, o que acontece com o benefício.</li>
              <li>Ser tratada com respeito, pelo nome.</li>
              <li>Falar com uma pessoa de verdade.</li>
            </ul>
          </div>
          <div className="mv-cli-per-col" data-tom="ambar">
            <b>O que ela teme</b>
            <ul>
              <li>Cair num golpe.</li>
              <li>Ter que pagar alguma coisa antes.</li>
              <li>Fazer algo errado no celular.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================================================================== pensamentos */
const BALOES = [
  { x: 130, y: 82, w: 210, t: 'Será que é golpe?' },
  { x: 380, y: 34, w: 270, t: 'Quero falar com gente de verdade.' },
  { x: 630, y: 82, w: 250, t: 'Vou ter que pagar alguma coisa?' },
  { x: 130, y: 212, w: 210, t: 'Não sei mexer nisso.' },
  { x: 630, y: 212, w: 250, t: 'Vou perguntar pro meu filho.' },
];
/** O que passa pela cabeça do cliente nos primeiros minutos. */
export function Pensamentos() {
  const hx = 380, hy = 160, esc = 1.3; // centro da cabeça e escala do desenho
  return (
    <Rolar>
      <svg className="mv-cli-svg" viewBox="0 0 760 312" role="img"
        aria-label="Uma senhora com o celular e cinco pensamentos: será que é golpe; quero falar com gente de verdade; vou ter que pagar alguma coisa; não sei mexer nisso; vou perguntar pro meu filho.">
        {BALOES.map((b) => {
          // bolinhas do pensamento: saem da cabeça em direção ao balão
          const dx = b.x - hx, dy = b.y - hy, len = Math.hypot(dx, dy) || 1;
          const em = (d: number) => ({ x: hx + (dx / len) * d, y: hy + (dy / len) * d });
          const perto = em(62), longe = em(84);
          return (
            <g key={b.t}>
              <circle className="mv-cli-bolinha" cx={perto.x} cy={perto.y} r="3.5" />
              <circle className="mv-cli-bolinha" cx={longe.x} cy={longe.y} r="5.5" />
              <rect className="mv-cli-balao" x={b.x - b.w / 2} y={b.y - 18} width={b.w} height="36" rx="18" />
              <text className="mv-cli-balao-t" x={b.x} y={b.y + 5} textAnchor="middle">{b.t}</text>
            </g>
          );
        })}
        <g transform={`translate(${hx} ${hy}) scale(${esc}) translate(${-hx} ${-hy})`}>
          <Pessoa cx={hx} cy={hy} idosa fone />
        </g>
      </svg>
    </Rolar>
  );
}

/* ===================================================================== seis atitudes */
const IcLinhas = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><path d="M5 8h10M5 12h14M5 16h7" /></svg>
);
const IcInterroga = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><path d="M9 9a3 3 0 115 2.2c-1.2.8-2 1.5-2 2.8M12 17.5v.01" /></svg>
);
const IcAa = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 18l5-12 5 12M4.8 14h6.4M15.5 13.5c.6-1.2 1.5-1.8 2.8-1.8 1.6 0 2.7 1 2.7 2.6V18M21 15.5c-3.2-.3-5.4.4-5.4 1.6 0 .9.8 1.4 1.9 1.4 1.7 0 3-1 3.5-2.2" /></svg>
);
const IcMicrofone = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" /></svg>
);
const IcRepetir = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 11a8 8 0 0114-5l2 2M20 13a8 8 0 01-14 5l-2-2" /><path d="M20 4v4h-4M4 20v-4h4" /></svg>
);
const IcAperto = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20s-7-4.2-7-9.2A3.8 3.8 0 0112 8.6a3.8 3.8 0 017 2.2c0 5-7 9.2-7 9.2z" /></svg>
);
const ATITUDES: { ic: ReactNode; t: string; d: string }[] = [
  { ic: <IcLinhas />, t: 'Frases curtas', d: 'Uma ideia por mensagem. Bloco de texto grande assusta e fica sem resposta.' },
  { ic: <IcInterroga />, t: 'Uma pergunta por vez', d: 'Três perguntas juntas viram uma resposta pela metade. Pergunte, espere, siga.' },
  { ic: <IcAa />, t: 'Palavras do dia a dia', d: 'Troque o jargão pelo jeito que ele fala. "Margem consignável" não diz nada para ele.' },
  { ic: <IcMicrofone />, t: 'Áudio quando ajudar', d: 'Muita gente entende melhor ouvindo. Áudio curto, voz calma e um resumo escrito.' },
  { ic: <IcRepetir />, t: 'Repetir sem impaciência', d: 'Perguntou de novo? Explique de outro jeito, com a mesma gentileza da primeira vez.' },
  { ic: <IcAperto />, t: 'Respeito sempre', d: 'Chame pelo nome, use "o senhor" ou "a senhora" e nunca pressione nem prometa.' },
];
/** As seis atitudes para falar com o nosso cliente. */
export function SeisAtitudes() {
  return (
    <div className="mv-cli-ati">
      {ATITUDES.map((a) => (
        <div key={a.t} className="vidro mv-cli-ati-it">
          <span className="mv-cli-ati-ic">{a.ic}</span>
          <b>{a.t}</b>
          <p>{a.d}</p>
        </div>
      ))}
    </div>
  );
}
