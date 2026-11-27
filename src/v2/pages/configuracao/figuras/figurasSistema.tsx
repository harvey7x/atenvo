/* ------------------------------------------------------------------
   Configuração inicial — FIGURAS DE DEMONSTRAÇÃO do sistema (WhatsApp,
   mensalidade, espera e sincronia). Ilustrações SVG estilo mockup —
   desenho vetorial limpo, NUNCA captura real: nada de dados pessoais,
   nada de logotipo de terceiros (banco e WhatsApp viram formas
   genéricas: círculo neutro, balão). Linguagem do Manual de vendas:
   traço 1.7, cor SÓ por var(--token) (claro/escuro saem sozinhos),
   rótulos curtos em pt-BR e realce DOURADO (anel) apenas no elemento
   onde a pessoa clica. Cada figura tem <title> acessível, viewBox fixo
   e width 100% — legível a 320px de largura.
   Sem CSS próprio: atributos de apresentação direto no SVG (zero risco
   de colisão de prefixo). Guarda: figurasSistema.test.tsx.
   ------------------------------------------------------------------ */
import { useId, type ReactNode } from 'react';

/* ---------- paleta por tokens (os mesmos do cromo v2) ---------- */
const TRACO = 1.7;
const TINTA = 'var(--txt)';
const TINTA_2 = 'var(--txt-2)';
const TINTA_3 = 'var(--txt-3)';
const FIO = 'rgba(var(--tint), .38)';
const FIO_SUAVE = 'rgba(var(--tint), .22)';
const SUPERFICIE = 'rgba(var(--tint), .05)';
const SUPERFICIE_2 = 'rgba(var(--tint), .09)';
const OURO = 'var(--azul)'; /* acento da casa (dourado): SÓ no ponto de clique */
const OURO_BG = 'rgba(var(--azul-rgb), .14)';
const VERDE = 'var(--verde)';
const VERDE_BG = 'var(--verde-bg)';
const AMBAR = 'var(--ambar)';
const AMBAR_BG = 'var(--ambar-bg)';

/* ---------- moldura comum: svg responsivo + <title> acessível ---------- */
function Fig({ titulo, vb, children }: { titulo: string; vb: string; children: ReactNode }) {
  const tid = useId();
  return (
    <svg viewBox={vb} width="100%" role="img" aria-labelledby={tid} focusable="false"
      style={{ display: 'block', height: 'auto' }}>
      <title id={tid}>{titulo}</title>
      {children}
    </svg>
  );
}

/* ---------- peças ---------- */
function Tx({ x, y, s = 12.5, cor = TINTA_2, peso = 500, anc = 'start', children }: {
  x: number; y: number; s?: number; cor?: string; peso?: number; anc?: 'start' | 'middle' | 'end'; children: ReactNode;
}) {
  return <text x={x} y={y} fontSize={s} fontWeight={peso} fill={cor} textAnchor={anc}>{children}</text>;
}

/** balão de conversa (cliente): retângulo arredondado + rabinho + duas linhas de "texto" */
function Balao({ x, y, w = 50, h = 32 }: { x: number; y: number; w?: number; h?: number }) {
  return (
    <g>
      <path d={`M${x + 8},${y + h - 5} L${x + 4},${y + h + 7} L${x + 17},${y + h - 4} z`}
        fill={SUPERFICIE} stroke={FIO_SUAVE} strokeWidth={1.2} strokeLinejoin="round" />
      <rect x={x} y={y} width={w} height={h} rx={9} fill={SUPERFICIE} stroke={FIO_SUAVE} strokeWidth={1.2} />
      <rect x={x + 9} y={y + h * 0.3} width={w - 18} height={3.4} rx={1.7} fill={FIO_SUAVE} />
      <rect x={x + 9} y={y + h * 0.3 + 8} width={(w - 18) * 0.62} height={3.4} rx={1.7} fill={FIO_SUAVE} />
    </g>
  );
}

/** avatar com iniciais (o desenho do .cini-av) */
function Avatar({ cx, cy, ini, r = 20 }: { cx: number; cy: number; ini: string; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={SUPERFICIE_2} stroke={FIO} strokeWidth={TRACO} />
      <text x={cx} y={cy + 4.5} fontSize={12.5} fontWeight={650} fill={TINTA} textAnchor="middle">{ini}</text>
    </g>
  );
}

/** celular: moldura + tela (fundo da base) + alto-falante */
function Fone({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children?: ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={18} fill={SUPERFICIE} stroke={FIO} strokeWidth={TRACO} />
      <rect x={x + 9} y={y + 13} width={w - 18} height={h - 24} rx={10} fill="var(--base)" stroke={FIO_SUAVE} strokeWidth={1.1} />
      <rect x={x + w / 2 - 11} y={y + 5.5} width={22} height={4} rx={2} fill={FIO_SUAVE} />
      {children}
    </g>
  );
}

/** o número de um atendente, pousado no fio (mini celular) */
function ChipNumero({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <rect x={cx - 9} y={cy - 15} width={18} height={30} rx={5} fill="var(--base)" stroke={FIO} strokeWidth={1.5} />
      <path d={`M${cx - 3},${cy + 9} h6`} stroke={FIO} strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
}

/** QR estilizado (desenho, não código de verdade): 3 localizadores + módulos fixos */
const QR_MAPA = [
  '...#.##....', '....#..#...', '...##.#....',
  '#.#..##..#.', '..##.#.##.#', '#.#.##..#..', '.#..#.##.#.', '#..##..#..#',
  '...#.##.#..', '....#..##.#', '...##.#...#',
];
function Qr({ x, y, s }: { x: number; y: number; s: number }) {
  const c = s / QR_MAPA.length;
  const loc = (fx: number, fy: number, k: string) => (
    <g key={k}>
      <rect x={fx + c * 0.22} y={fy + c * 0.22} width={c * 2.56} height={c * 2.56} rx={c * 0.4}
        fill="none" stroke={TINTA} strokeWidth={c * 0.44} />
      <rect x={fx + c * 1.08} y={fy + c * 1.08} width={c * 0.84} height={c * 0.84} rx={c * 0.18} fill={TINTA} />
    </g>
  );
  return (
    <g>
      {loc(x, y, 'a')}{loc(x + 8 * c, y, 'b')}{loc(x, y + 8 * c, 'c')}
      {QR_MAPA.flatMap((linha, l) => [...linha].map((ch, k) => (ch === '#'
        ? <rect key={`${l}-${k}`} x={x + k * c + c * 0.08} y={y + l * c + c * 0.08} width={c * 0.84} height={c * 0.84} fill={TINTA} />
        : null)))}
    </g>
  );
}

/** passo numerado (1, 2, 3) */
function Passo({ cx, cy, n }: { cx: number; cy: number; n: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill={SUPERFICIE_2} stroke={FIO} strokeWidth={1.2} />
      <text x={cx} y={cy + 3.8} fontSize={11} fontWeight={650} fill={TINTA} textAnchor="middle">{n}</text>
    </g>
  );
}

/** check verde (concluído), com halo da base para pousar sobre outros traços */
function SeloOk({ cx, cy, r = 10 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 1.5} fill="var(--base)" />
      <circle cx={cx} cy={cy} r={r} fill={VERDE_BG} stroke={VERDE} strokeWidth={TRACO} />
      <path d={`M${cx - 4.2},${cy + 0.4} l2.9,3 l5.6,-6.2`} fill="none" stroke={VERDE} strokeWidth={1.9}
        strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** selo discreto de atenção (triângulo com !) — âmbar = risco real */
function SeloAtencao({ cx, cy }: { cx: number; cy: number }) {
  const d = `M${cx},${cy - 11} L${cx + 11.5},${cy + 8.5} L${cx - 11.5},${cy + 8.5} z`;
  return (
    <g>
      <path d={d} fill="var(--base)" />
      <path d={d} fill={AMBAR_BG} stroke={AMBAR} strokeWidth={TRACO} strokeLinejoin="round" />
      <path d={`M${cx},${cy - 4} V${cy + 1.2}`} stroke={AMBAR} strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={cx} cy={cy + 5} r={1.1} fill={AMBAR} />
    </g>
  );
}

/** engrenagem suave (decoração da espera) */
function Engrenagem({ cx, cy, r, op = 0.5 }: { cx: number; cy: number; r: number; op?: number }) {
  const dentes = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const p = (rr: number) => `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
    return `M${p(r)} L${p(r + 5)}`;
  }).join(' ');
  return (
    <g opacity={op}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={FIO_SUAVE} strokeWidth={TRACO} />
      <circle cx={cx} cy={cy} r={r * 0.42} fill="none" stroke={FIO_SUAVE} strokeWidth={1.4} />
      <path d={dentes} stroke={FIO_SUAVE} strokeWidth={TRACO} strokeLinecap="round" fill="none" />
    </g>
  );
}

/* ==================================================================
   1. Um número por atendente: cada um ligado por um fio (com o
      próprio número no meio) ao seu grupo de clientes.
   ================================================================== */
const ATENDENTES = [
  { ini: 'AN', nome: 'Ana', y: 78 },
  { ini: 'BR', nome: 'Bruno', y: 156 },
  { ini: 'CA', nome: 'Carla', y: 234 },
];
export function FigModoAtendentes() {
  return (
    <Fig vb="0 0 520 300"
      titulo="Três atendentes, cada um ligado pelo próprio número ao seu grupo de clientes: o volume de envios fica dividido.">
      <Tx x={96} y={34} s={12.5} cor={TINTA_3} peso={600} anc="middle">Atendentes</Tx>
      <Tx x={402} y={34} s={12.5} cor={TINTA_3} peso={600} anc="middle">Clientes de cada um</Tx>
      {ATENDENTES.map((a) => (
        <g key={a.ini}>
          <path d={`M120,${a.y} H308`} stroke={FIO} strokeWidth={TRACO} strokeLinecap="round" />
          <ChipNumero cx={226} cy={a.y} />
          <Avatar cx={96} cy={a.y} ini={a.ini} />
          <Tx x={96} y={a.y + 38} s={12} anc="middle">{a.nome}</Tx>
          <Balao x={318} y={a.y - 16} />
          <Balao x={378} y={a.y - 16} />
          <Balao x={438} y={a.y - 16} />
        </g>
      ))}
      <SeloOk cx={158} cy={285} />
      <Tx x={176} y={289} s={12.5}>Cada número envia só para os próprios clientes</Tx>
    </Fig>
  );
}

/* ==================================================================
   2. Um número só para todos: o volume inteiro concentrado num
      número — com o selo discreto de atenção.
   ================================================================== */
const LEQUE = [
  { x: 344, y: 36 }, { x: 368, y: 68 }, { x: 383, y: 103 }, { x: 388, y: 140 },
  { x: 383, y: 177 }, { x: 368, y: 212 }, { x: 344, y: 244 },
];
export function FigModoUnico() {
  return (
    <Fig vb="0 0 520 300"
      titulo="Um único número ligado a todos os clientes, com um selo de atenção: o volume concentrado aumenta o risco de bloqueio.">
      {LEQUE.map((b) => (
        <path key={`${b.x}-${b.y}`} d={`M158,140 C216,140 ${b.x - 58},${b.y} ${b.x - 2},${b.y}`}
          fill="none" stroke={FIO} strokeWidth={1.4} strokeLinecap="round" />
      ))}
      {LEQUE.map((b) => <Balao key={`b-${b.x}-${b.y}`} x={b.x} y={b.y - 12} w={44} h={24} />)}
      <Fone x={84} y={76} w={72} h={124}>
        <Balao x={102} y={116} w={36} h={22} />
      </Fone>
      <SeloAtencao cx={160} cy={82} />
      <Tx x={120} y={226} s={13.5} cor={TINTA} peso={650} anc="middle">1 número</Tx>
      <Tx x={120} y={244} s={12.5} anc="middle">todos os envios</Tx>
      <Tx x={260} y={290} s={12.5} anc="middle">Um bloqueio para a cobrança de todos ao mesmo tempo</Tx>
    </Fig>
  );
}

/* ==================================================================
   3. Conectar pelo QR: o caminho no celular (WhatsApp > Aparelhos
      conectados > Conectar aparelho) e o código na tela do sistema.
      Realce dourado SÓ em "Conectar aparelho" (onde a pessoa toca).
   ================================================================== */
export function FigQrConectar() {
  const mid = useId();
  return (
    <Fig vb="0 0 520 300"
      titulo="Celular com o caminho WhatsApp, Aparelhos conectados e Conectar aparelho em três passos, apontando a câmera para o QR Code na tela do sistema.">
      <defs>
        <marker id={mid} viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M0,1.2 L8.8,5 L0,8.8 z" fill={FIO} />
        </marker>
      </defs>

      {/* a tela do sistema, com o código */}
      <rect x={276} y={40} width={212} height={222} rx={14} fill={SUPERFICIE} stroke={FIO_SUAVE} strokeWidth={1.2} />
      <Tx x={382} y={66} s={13.5} cor={TINTA} peso={650} anc="middle">Conectar WhatsApp</Tx>
      <Tx x={382} y={83} s={11.5} cor={TINTA_3} anc="middle">na tela do sistema</Tx>
      <rect x={322} y={94} width={120} height={120} rx={10} fill="rgba(var(--tint), .04)" stroke={FIO_SUAVE} strokeWidth={1} />
      <Qr x={331} y={103} s={102} />
      <Tx x={382} y={238} s={12} anc="middle">aponte a câmera do celular</Tx>

      {/* a câmera lendo o código */}
      <path d={`M212,208 C252,208 266,164 314,156`} fill="none" stroke={FIO} strokeWidth={TRACO}
        strokeDasharray="3 6" strokeLinecap="round" markerEnd={`url(#${mid})`} />

      {/* o celular com o caminho em 3 passos */}
      <Fone x={40} y={26} w={168} h={250}>
        {/* 1 · WhatsApp (forma genérica: balão) */}
        <rect x={60} y={78} width={128} height={44} rx={10} fill={SUPERFICIE} stroke={FIO_SUAVE} strokeWidth={1.2} />
        <Passo cx={78} cy={100} n={1} />
        <g>
          <rect x={94} y={92} width={17} height={12.5} rx={4.5} fill="none" stroke={TINTA_2} strokeWidth={1.4} />
          <path d="M99,104.5 l-2.6,3.6 0.8,-3.6" fill="none" stroke={TINTA_2} strokeWidth={1.4} strokeLinejoin="round" />
        </g>
        <Tx x={117} y={104.5} s={12.5} cor={TINTA} peso={600}>WhatsApp</Tx>
        <path d="M118,129 l6,6 6,-6" fill="none" stroke={FIO} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round" />

        {/* 2 · Aparelhos conectados */}
        <rect x={60} y={146} width={128} height={44} rx={10} fill={SUPERFICIE} stroke={FIO_SUAVE} strokeWidth={1.2} />
        <Passo cx={78} cy={168} n={2} />
        <Tx x={94} y={164.5} s={12} cor={TINTA} peso={600}>Aparelhos</Tx>
        <Tx x={94} y={179} s={12} cor={TINTA} peso={600}>conectados</Tx>
        <path d="M118,197 l6,6 6,-6" fill="none" stroke={FIO} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round" />

        {/* 3 · Conectar aparelho — é AQUI que a pessoa toca */}
        <rect x={60} y={214} width={128} height={44} rx={10} fill={OURO_BG} stroke={OURO} strokeWidth={TRACO} />
        <Passo cx={78} cy={236} n={3} />
        <Tx x={94} y={232.5} s={12} cor={TINTA} peso={600}>Conectar</Tx>
        <Tx x={94} y={247} s={12} cor={TINTA} peso={600}>aparelho</Tx>
      </Fone>
    </Fig>
  );
}

/* ==================================================================
   4. Pagar o Pix: o app do banco (genérico) lendo o QR Code na tela
      do sistema; realce dourado no botão Pagar e check de confirmação.
   ================================================================== */
export function FigPixPagar() {
  const mid = useId();
  return (
    <Fig vb="0 0 520 300"
      titulo="Celular com um aplicativo de banco genérico lendo o QR Code do Pix na tela do sistema; o pagamento é confirmado com um check verde.">
      <defs>
        <marker id={mid} viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M0,1.2 L8.8,5 L0,8.8 z" fill={FIO} />
        </marker>
      </defs>

      {/* a tela do sistema, com o QR do Pix */}
      <rect x={36} y={40} width={200} height={222} rx={14} fill={SUPERFICIE} stroke={FIO_SUAVE} strokeWidth={1.2} />
      <Tx x={136} y={66} s={13.5} cor={TINTA} peso={650} anc="middle">Pix da mensalidade</Tx>
      <Tx x={136} y={83} s={11.5} cor={TINTA_3} anc="middle">na tela do sistema</Tx>
      <rect x={81} y={94} width={110} height={110} rx={10} fill="rgba(var(--tint), .04)" stroke={FIO_SUAVE} strokeWidth={1} />
      <Qr x={89} y={102} s={94} />
      <Tx x={136} y={232} s={12} anc="middle">ou copie o código Pix</Tx>

      {/* a câmera do banco lendo o código */}
      <path d={`M337,138 C300,138 258,148 201,148`} fill="none" stroke={FIO} strokeWidth={TRACO}
        strokeDasharray="3 6" strokeLinecap="round" markerEnd={`url(#${mid})`} />

      {/* o celular com o app do banco (genérico) */}
      <Fone x={300} y={26} w={170} h={250}>
        <circle cx={334} cy={62} r={11} fill={SUPERFICIE_2} stroke={FIO} strokeWidth={1.4} />
        <Tx x={353} y={60} s={13} cor={TINTA} peso={650}>Banco</Tx>
        <Tx x={353} y={75} s={11} cor={TINTA_3}>pagar com Pix</Tx>
        {/* visor da câmera com o QR */}
        <g fill="none" stroke={TINTA_2} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round">
          <path d="M341,110 V98 Q341,94 345,94 H357" />
          <path d="M413,94 H425 Q429,94 429,98 V110" />
          <path d="M429,166 V178 Q429,182 425,182 H413" />
          <path d="M357,182 H345 Q341,182 341,178 V166" />
        </g>
        <Qr x={357} y={110} s={56} />
        <Tx x={385} y={202} s={11.5} anc="middle">lendo o QR Code…</Tx>
        {/* o botão em que a pessoa toca */}
        <rect x={331} y={212} width={108} height={36} rx={9} fill={OURO_BG} stroke={OURO} strokeWidth={TRACO} />
        <Tx x={385} y={234.5} s={13} cor={TINTA} peso={650} anc="middle">Pagar</Tx>
      </Fone>

      {/* a confirmação */}
      <SeloOk cx={163} cy={285} />
      <Tx x={181} y={289} s={12.5} cor={VERDE} peso={600}>Pagamento confirmado na hora</Tx>
    </Fig>
  );
}

/* ==================================================================
   5. Espera da equipe: relógio e engrenagens serenas com as três
      etapas em miniatura (planilha, balão, moeda). Sem âmbar.
   ================================================================== */
export function FigEsperaEquipe() {
  return (
    <Fig vb="0 0 520 300"
      titulo="Relógio sereno com engrenagens e as três etapas da configuração em miniatura: planilha, WhatsApp e mensalidade.">
      <Tx x={260} y={36} s={12.5} cor={TINTA_3} anc="middle">configuração em andamento</Tx>
      <Engrenagem cx={356} cy={84} r={22} op={0.45} />
      <Engrenagem cx={176} cy={94} r={15} op={0.35} />

      {/* o relógio */}
      <circle cx={260} cy={124} r={54} fill={SUPERFICIE} stroke={FIO} strokeWidth={TRACO} />
      <g stroke={FIO} strokeWidth={TRACO} strokeLinecap="round">
        <path d="M260,76 V84" /><path d="M308,124 H300" /><path d="M260,172 V164" /><path d="M212,124 H220" />
      </g>
      <g stroke={TINTA_2} strokeWidth={2.2} strokeLinecap="round">
        <path d="M260,124 L241,111" /><path d="M260,124 L274,96" />
      </g>
      <circle cx={260} cy={124} r={3} fill={TINTA_2} />

      {/* trilho pontilhado entre as etapas */}
      <g stroke={FIO_SUAVE} strokeWidth={2} strokeLinecap="round" strokeDasharray="0.5 8">
        <path d="M190,230 H232" /><path d="M288,230 H330" />
      </g>

      {/* as três etapas em miniatura */}
      <rect x={138} y={206} width={48} height={48} rx={12} fill={SUPERFICIE} stroke={FIO_SUAVE} strokeWidth={1.2} />
      <g fill="none" stroke={TINTA_2} strokeWidth={1.6} strokeLinecap="round">
        <rect x={150} y={218} width={24} height={24} rx={4} />
        <path d="M150,226 H174" /><path d="M150,234 H174" /><path d="M162,226 V242" />
      </g>

      <rect x={236} y={206} width={48} height={48} rx={12} fill={SUPERFICIE} stroke={FIO_SUAVE} strokeWidth={1.2} />
      <g fill="none" stroke={TINTA_2} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x={248} y={219} width={24} height={16.5} rx={6} />
        <path d="M254,235.5 l-3.6,5.2 1.2,-5.2" />
        <path d="M255,227.5 h10" />
      </g>

      <rect x={334} y={206} width={48} height={48} rx={12} fill={SUPERFICIE} stroke={FIO_SUAVE} strokeWidth={1.2} />
      <circle cx={358} cy={230} r={12.5} fill="none" stroke={TINTA_2} strokeWidth={1.6} />
      <text x={358} y={234} fontSize={9.5} fontWeight={700} fill={TINTA_2} textAnchor="middle">R$</text>

      <Tx x={162} y={274} s={12.5} anc="middle">Planilha</Tx>
      <Tx x={260} y={274} s={12.5} anc="middle">WhatsApp</Tx>
      <Tx x={358} y={274} s={12.5} anc="middle">Mensalidade</Tx>
    </Fig>
  );
}

/* ==================================================================
   6. Sincronia (topo da etapa 1): planilha ⇄ sistema, setas nos dois
      sentidos e o relógio dos 15 minutos.
   ================================================================== */
export function FigSincronia() {
  const mid = useId();
  return (
    <Fig vb="0 0 520 240"
      titulo="Planilha e sistema ligados por setas nos dois sentidos, com um relógio marcando a sincronização a cada quinze minutos.">
      <defs>
        <marker id={mid} viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M0,1.2 L8.8,5 L0,8.8 z" fill="rgba(var(--tint), .55)" />
        </marker>
      </defs>

      {/* a planilha */}
      <rect x={44} y={50} width={152} height={116} rx={14} fill={SUPERFICIE} stroke={FIO_SUAVE} strokeWidth={1.2} />
      <g fill={FIO}>
        <rect x={58} y={62} width={24} height={5} rx={2.5} /><rect x={100} y={62} width={24} height={5} rx={2.5} /><rect x={142} y={62} width={24} height={5} rx={2.5} />
      </g>
      <g stroke={FIO_SUAVE} strokeWidth={1}>
        <path d="M58,84 H182" /><path d="M58,110 H182" /><path d="M58,136 H182" />
        <path d="M99,78 V152" /><path d="M140,78 V152" />
      </g>
      <Tx x={120} y={190} s={13.5} cor={TINTA} peso={650} anc="middle">Planilha</Tx>

      {/* o sistema */}
      <rect x={324} y={50} width={152} height={116} rx={14} fill={SUPERFICIE} stroke={FIO_SUAVE} strokeWidth={1.2} />
      <rect x={334} y={62} width={18} height={92} rx={6} fill={SUPERFICIE_2} />
      <rect x={360} y={62} width={104} height={10} rx={5} fill={SUPERFICIE_2} />
      <g fill="rgba(var(--tint), .12)">
        <rect x={360} y={84} width={104} height={10} rx={5} /><rect x={360} y={102} width={86} height={10} rx={5} />
        <rect x={360} y={120} width={96} height={10} rx={5} /><rect x={360} y={138} width={70} height={10} rx={5} />
      </g>
      <Tx x={400} y={190} s={13.5} cor={TINTA} peso={650} anc="middle">Sistema</Tx>

      {/* as setas, nos dois sentidos */}
      <g fill="none" stroke="rgba(var(--tint), .55)" strokeWidth={TRACO} strokeLinecap="round">
        <path d="M212,86 H304" markerEnd={`url(#${mid})`} />
        <path d="M308,132 H216" markerEnd={`url(#${mid})`} />
      </g>

      {/* o relógio dos 15 minutos */}
      <rect x={224} y={96} width={72} height={26} rx={13} fill="var(--base)" stroke={FIO_SUAVE} strokeWidth={1.2} />
      <circle cx={240} cy={109} r={7.5} fill="none" stroke={TINTA_2} strokeWidth={1.5} />
      <path d="M240,109 V104.8 M240,109 L243.4,109" stroke={TINTA_2} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Tx x={253} y={113} s={12} cor={TINTA} peso={600}>15 min</Tx>

      <Tx x={260} y={222} s={12.5} anc="middle">As mudanças vão e voltam sozinhas, a cada 15 minutos</Tx>
    </Fig>
  );
}
